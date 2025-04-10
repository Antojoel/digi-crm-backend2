const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Calculate token expiration time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours from now

    // Store token in user_sessions table
    await db.query(
      `INSERT INTO user_sessions (user_id, token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, token, req.ip, req.headers['user-agent'], expiresAt]
    );

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
    const { response, statusCode } = formatSuccess({
      token,
      user: userData
    });

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
    // Get the token from the authorization header
    const token = req.headers.authorization.split(' ')[1];

    // Remove the token from the user_sessions table
    await db.query(
      'DELETE FROM user_sessions WHERE token = $1',
      [token]
    );

    // Send the response
    const { response, statusCode } = formatSuccess(
      null,
      'Successfully logged out'
    );

    res.status(statusCode).json(response);
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

module.exports = {
  login,
  logout,
  getCurrentUser
};