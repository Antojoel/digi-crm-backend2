const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const db = require('../config/db');
const { formatSuccess, formatError } = require('../utils/responseFormatter');
const { AppError } = require('../utils/errorHandler');

/**
 * Login a user
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation error', 'validation', errors.array());
    }

    const { email, password } = req.body;

    // Find the user
    const userResult = await db.query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.avatar, r.name as role
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [email]
    );

    // Check if user exists
    if (userResult.rows.length === 0) {
      throw new AppError('Invalid credentials', 'authentication');
    }

    const user = userResult.rows[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      throw new AppError('Invalid credentials', 'authentication');
    }

    // Get user permissions
    const permissionsResult = await db.query(
      `SELECT p.resource, p.action
       FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       JOIN roles r ON rp.role_id = r.id
       WHERE r.name = $1`,
      [user.role]
    );
    
    // Organize permissions by resource
    const permissions = {};
    permissionsResult.rows.forEach(perm => {
      if (!permissions[perm.resource]) {
        permissions[perm.resource] = [];
      }
      permissions[perm.resource].push(perm.action);
    });

    // Store user ID in session
    req.session.userId = user.id;

    // Update last login timestamp
    await db.query(
      `UPDATE users SET last_login = NOW() WHERE id = $1`,
      [user.id]
    );

    // Prepare user data for response
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      permissions
    };

    // Send the response
    const { response, statusCode } = formatSuccess({ user: userData });

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Logout a user
 * POST /api/auth/logout
 */
const logout = async (req, res, next) => {
  try {
    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        throw new AppError('Error logging out', 'general');
      }
      
      // Send the response
      const { response, statusCode } = formatSuccess(
        null,
        'Successfully logged out'
      );
      
      res.status(statusCode).json(response);
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get the current user
 * GET /api/auth/me
 */
const getCurrentUser = async (req, res, next) => {
  try {
    // User is already attached to req by the authenticate middleware
    const { response, statusCode } = formatSuccess({
      user: req.user
    });

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Register a new user
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation error', 'validation', errors.array());
    }

    const { name, email, password } = req.body;

    // Check if email already exists
    const emailCheck = await db.query(
      'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );

    if (emailCheck.rows.length > 0) {
      throw new AppError('Email already in use', 'validation');
    }

    // Get default role (sales)
    const roleQuery = 'SELECT id FROM roles WHERE name = $1';
    const roleResult = await db.query(roleQuery, ['sales']);

    if (roleResult.rows.length === 0) {
      throw new AppError('Default role not found', 'validation');
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
        created_at as "createdAt"
    `;

    const userResult = await db.query(insertQuery, [
      name,
      email,
      passwordHash,
      roleId
    ]);

    // Create notification settings for the user
    await db.query(
      'INSERT INTO notification_settings (user_id) VALUES ($1)',
      [userResult.rows[0].id]
    );

    const { response, statusCode } = formatSuccess(
      { user: userResult.rows[0] },
      'User registered successfully',
      201
    );

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  logout,
  getCurrentUser,
  register
};