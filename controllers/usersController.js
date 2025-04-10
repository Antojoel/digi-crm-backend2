const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const db = require('../config/db');
const { formatSuccess } = require('../utils/responseFormatter');
const { AppError } = require('../utils/errorHandler');

/**
 * Get all users (admin only)
 * GET /api/users
 */
const getAllUsers = async (req, res, next) => {
  try {
    // Only super_admin can view all users
    if (req.user.role !== 'super_admin') {
      throw new AppError('You do not have permission to view all users', 'authorization');
    }

    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        r.name as role,
        u.created_at as "createdAt"
      FROM 
        users u
      JOIN
        roles r ON u.role_id = r.id
      WHERE 
        u.deleted_at IS NULL
      ORDER BY
        u.created_at DESC
    `;

    const usersResult = await db.query(query);

    const { response, statusCode } = formatSuccess({
      users: usersResult.rows
    });

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Get a user by ID (admin or self)
 * GET /api/users/:id
 */
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if user has permission (admin or self)
    if (req.user.role !== 'super_admin' && req.user.id !== parseInt(id)) {
      throw new AppError('You do not have permission to view this user', 'authorization');
    }

    // Get user data with role, permissions, and stats
    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        r.name as role,
        u.created_at as "createdAt"
      FROM 
        users u
      JOIN
        roles r ON u.role_id = r.id
      WHERE 
        u.id = $1 AND u.deleted_at IS NULL
    `;

    const userResult = await db.query(query, [id]);

    if (userResult.rows.length === 0) {
      throw new AppError('User not found', 'not_found');
    }

    // Get permissions for the user's role
    const permissionsQuery = `
      SELECT 
        p.resource,
        p.action
      FROM 
        permissions p
      JOIN
        role_permissions rp ON p.id = rp.permission_id
      JOIN
        roles r ON rp.role_id = r.id
      WHERE 
        r.name = $1
    `;

    const permissionsResult = await db.query(permissionsQuery, [userResult.rows[0].role]);

    // Organize permissions by resource
    const permissions = {};
    permissionsResult.rows.forEach(perm => {
      if (!permissions[perm.resource]) {
        permissions[perm.resource] = [];
      }
      permissions[perm.resource].push(perm.action);
    });

    // Get user stats if user is a sales or telecaller role
    let stats = null;
    if (['sales', 'telecaller'].includes(userResult.rows[0].role)) {
      const statsQuery = `
        SELECT 
          COUNT(id) as "totalLeads",
          SUM(CASE WHEN stage IN ('won', 'completed') THEN 1 ELSE 0 END) as "wonLeads",
          CASE 
            WHEN COUNT(id) > 0 THEN 
              ROUND((SUM(CASE WHEN stage IN ('won', 'completed') THEN 1 ELSE 0 END)::NUMERIC / COUNT(id)::NUMERIC) * 100, 2)
            ELSE 0
          END as "conversionRate"
        FROM 
          leads
        WHERE 
          created_by = $1 AND deleted_at IS NULL
      `;

      const statsResult = await db.query(statsQuery, [id]);
      stats = statsResult.rows[0];
    }

    // Combine user data with permissions and stats
    const userData = {
      ...userResult.rows[0],
      permissions,
      stats
    };

    const { response, statusCode } = formatSuccess({
      user: userData
    });

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new user (admin only)
 * POST /api/users
 */
const createUser = async (req, res, next) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation error', 'validation', errors.array());
    }

    const { name, email, password, role } = req.body;

    // Check if email already exists
    const emailCheck = await db.query(
      'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );

    if (emailCheck.rows.length > 0) {
      throw new AppError('Email already in use', 'validation');
    }

    // Get role ID from role name
    const roleQuery = 'SELECT id FROM roles WHERE name = $1';
    const roleResult = await db.query(roleQuery, [role]);

    if (roleResult.rows.length === 0) {
      throw new AppError('Invalid role', 'validation');
    }

    const roleId = roleResult.rows[0].id;

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert the user
    const insertQuery = `
      INSERT INTO users (
        name, 
        email, 
        password_hash, 
        role_id
      ) VALUES ($1, $2, $3, $4)
      RETURNING 
        id, 
        name, 
        email, 
        role_id,
        created_at as "createdAt"
    `;

    const userResult = await db.query(insertQuery, [
      name,
      email,
      passwordHash,
      roleId
    ]);

    // Get the role name for the response
    const user = {
      ...userResult.rows[0],
      role
    };
    delete user.role_id;

    // Create notification settings for the user
    await db.query(
      'INSERT INTO notification_settings (user_id) VALUES ($1)',
      [user.id]
    );

    const { response, statusCode } = formatSuccess(
      { user },
      'User created successfully',
      201
    );

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};
/**
 * Update a user (admin or self)
 * PUT /api/users/:id
 */
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if user has permission (admin or self)
    if (req.user.role !== 'super_admin' && req.user.id !== parseInt(id)) {
      throw new AppError('You do not have permission to update this user', 'authorization');
    }

    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation error', 'validation', errors.array());
    }

    // Get user data
    const checkQuery = 'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL';
    const checkResult = await db.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      throw new AppError('User not found', 'not_found');
    }

    const { name, phone } = req.body;

    // Build update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = ${paramIndex++}`);
      values.push(name);
    }

    if (phone !== undefined) {
      updates.push(`phone = ${paramIndex++}`);
      values.push(phone);
    }

    // Add updated_at timestamp
    updates.push(`updated_at = NOW()`);

    if (updates.length === 0) {
      throw new AppError('No update fields provided', 'validation');
    }

    // Add ID to values array
    values.push(id);

    // Update the user
    const updateQuery = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = ${paramIndex}
      RETURNING 
        id, 
        name, 
        email,
        phone,
        updated_at as "updatedAt"
    `;

    const userResult = await db.query(updateQuery, values);

    const { response, statusCode } = formatSuccess({
      user: userResult.rows[0]
    });

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a user (admin only)
 * DELETE /api/users/:id
 */
const deleteUser = async (req, res, next) => {
  try {
    // Only super_admin can delete users
    if (req.user.role !== 'super_admin') {
      throw new AppError('You do not have permission to delete users', 'authorization');
    }

    const { id } = req.params;

    // Check if user exists
    const checkQuery = 'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL';
    const checkResult = await db.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      throw new AppError('User not found', 'not_found');
    }

    // Cannot delete super_admin user
    const roleQuery = 'SELECT r.name FROM roles r JOIN users u ON r.id = u.role_id WHERE u.id = $1';
    const roleResult = await db.query(roleQuery, [id]);

    if (roleResult.rows[0].name === 'super_admin') {
      throw new AppError('Cannot delete super_admin user', 'validation');
    }

    // Check if user owns any leads, customers, or companies
    const resourcesQuery = `
      SELECT 
        (SELECT COUNT(*) FROM leads WHERE created_by = $1 AND deleted_at IS NULL) as lead_count,
        (SELECT COUNT(*) FROM customers WHERE created_by = $1 AND deleted_at IS NULL) as customer_count,
        (SELECT COUNT(*) FROM companies WHERE created_by = $1 AND deleted_at IS NULL) as company_count
    `;

    const resourcesResult = await db.query(resourcesQuery, [id]);
    const resources = resourcesResult.rows[0];

    if (parseInt(resources.lead_count) > 0 || 
        parseInt(resources.customer_count) > 0 || 
        parseInt(resources.company_count) > 0) {
      throw new AppError('Cannot delete user who owns leads, customers, or companies', 'validation');
    }

    // Soft delete the user
    const deleteQuery = `
      UPDATE users
      SET deleted_at = NOW()
      WHERE id = $1
    `;

    await db.query(deleteQuery, [id]);

    // Also invalidate all user sessions
    await db.query(
      'DELETE FROM user_sessions WHERE user_id = $1',
      [id]
    );

    const { response, statusCode } = formatSuccess(
      null,
      'User deleted successfully'
    );

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Update a user's role (admin only)
 * PUT /api/users/:id/role
 */
const updateUserRole = async (req, res, next) => {
  try {
    // Only super_admin can update roles
    if (req.user.role !== 'super_admin') {
      throw new AppError('You do not have permission to update user roles', 'authorization');
    }

    const { id } = req.params;
    const { role } = req.body;

    // Validate role
    if (!role) {
      throw new AppError('Role is required', 'validation');
    }

    // Check if user exists
    const checkQuery = 'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL';
    const checkResult = await db.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      throw new AppError('User not found', 'not_found');
    }

    // Get role ID from role name
    const roleQuery = 'SELECT id FROM roles WHERE name = $1';
    const roleResult = await db.query(roleQuery, [role]);

    if (roleResult.rows.length === 0) {
      throw new AppError('Invalid role', 'validation');
    }

    const roleId = roleResult.rows[0].id;

    // Update the user's role
    const updateQuery = `
      UPDATE users
      SET role_id = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING 
        id, 
        name, 
        email,
        updated_at as "updatedAt"
    `;

    const userResult = await db.query(updateQuery, [roleId, id]);

    // Add role to the response
    const user = {
      ...userResult.rows[0],
      role
    };

    const { response, statusCode } = formatSuccess({
      user
    });

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all role permissions (admin only)
 * GET /api/roles/permissions
 */
const getRolePermissions = async (req, res, next) => {
  try {
    // Only super_admin can view role permissions
    if (req.user.role !== 'super_admin') {
      throw new AppError('You do not have permission to view role permissions', 'authorization');
    }

    // Get all roles with their permissions
    const query = `
      SELECT 
        r.name as role,
        p.resource,
        p.action
      FROM 
        roles r
      JOIN
        role_permissions rp ON r.id = rp.role_id
      JOIN
        permissions p ON rp.permission_id = p.id
      ORDER BY
        r.name, p.resource, p.action
    `;

    const result = await db.query(query);

    // Organize permissions by role and resource
    const permissions = {};
    result.rows.forEach(row => {
      if (!permissions[row.role]) {
        permissions[row.role] = {};
      }
      
      if (!permissions[row.role][row.resource]) {
        permissions[row.role][row.resource] = [];
      }
      
      permissions[row.role][row.resource].push(row.action);
    });

    const { response, statusCode } = formatSuccess({
      permissions
    });

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Update role permissions (admin only)
 * PUT /api/roles/:role/permissions
 */
const updateRolePermissions = async (req, res, next) => {
  try {
    // Only super_admin can update role permissions
    if (req.user.role !== 'super_admin') {
      throw new AppError('You do not have permission to update role permissions', 'authorization');
    }

    const { role } = req.params;
    const { permissions } = req.body;

    // Validate permissions object
    if (!permissions || typeof permissions !== 'object') {
      throw new AppError('Valid permissions object is required', 'validation');
    }

    // Check if role exists
    const roleQuery = 'SELECT id FROM roles WHERE name = $1';
    const roleResult = await db.query(roleQuery, [role]);

    if (roleResult.rows.length === 0) {
      throw new AppError('Invalid role', 'validation');
    }

    const roleId = roleResult.rows[0].id;

    // Start a transaction
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Delete existing permissions for the role
      await client.query(
        'DELETE FROM role_permissions WHERE role_id = $1',
        [roleId]
      );

      // Prepare permissions for insertion
      const permissionsToInsert = [];
      
      for (const resource in permissions) {
        const actions = permissions[resource];
        
        if (Array.isArray(actions)) {
          for (const action of actions) {
            // Get permission ID
            const permissionQuery = 'SELECT id FROM permissions WHERE resource = $1 AND action = $2';
            const permissionResult = await client.query(permissionQuery, [resource, action]);
            
            if (permissionResult.rows.length > 0) {
              permissionsToInsert.push({
                roleId,
                permissionId: permissionResult.rows[0].id
              });
            }
          }
        }
      }

      // Insert new permissions
      if (permissionsToInsert.length > 0) {
        const insertValues = permissionsToInsert.map(p => `(${p.roleId}, ${p.permissionId})`).join(', ');
        const insertQuery = `
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES ${insertValues}
        `;
        
        await client.query(insertQuery);
      }

      await client.query('COMMIT');

      const { response, statusCode } = formatSuccess({
        role,
        permissions
      });

      res.status(statusCode).json(response);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateUserRole,
  getRolePermissions,
  updateRolePermissions
};