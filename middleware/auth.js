const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/errorHandler');
const db = require('../config/db');

/**
 * Authentication middleware to verify JWT tokens
 */
const authenticate = async (req, res, next) => {
  try {
    // Get the authorization header
    const authHeader = req.headers.authorization;
    
    // Check if the authorization header exists
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication token is required', 'authentication');
    }

    // Extract the token
    const token = authHeader.split(' ')[1];

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if the token is in the user_sessions table
    const sessionResult = await db.query(
      'SELECT * FROM user_sessions WHERE token = $1 AND expires_at > NOW()',
      [token]
    );

    if (sessionResult.rows.length === 0) {
      throw new AppError('Invalid or expired token', 'authentication');
    }
    
    // Get the user
    const userResult = await db.query(
      `SELECT u.id, u.name, u.email, r.name as role 
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      throw new AppError('User not found or inactive', 'authentication');
    }

    // Get user permissions
    const permissionsResult = await db.query(
      `SELECT p.resource, p.action
       FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       JOIN roles r ON rp.role_id = r.id
       WHERE r.name = $1`,
      [userResult.rows[0].role]
    );
    
    // Organize permissions by resource
    const permissions = {};
    permissionsResult.rows.forEach(perm => {
      if (!permissions[perm.resource]) {
        permissions[perm.resource] = [];
      }
      permissions[perm.resource].push(perm.action);
    });

    // Add user to request object
    req.user = {
      id: userResult.rows[0].id,
      name: userResult.rows[0].name,
      email: userResult.rows[0].email,
      role: userResult.rows[0].role,
      permissions
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      next(new AppError('Invalid or expired token', 'authentication'));
    } else {
      next(error);
    }
  }
};

module.exports = {
  authenticate
};