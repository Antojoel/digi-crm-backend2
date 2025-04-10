const express = require('express');
const { body, param, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { formatSuccess } = require('../utils/responseFormatter');
const { AppError } = require('../utils/errorHandler');
const { 
  getAllUsers, 
  getUserById, 
  createUser, 
  updateUser, 
  deleteUser,
  updateUserRole,
  getRolePermissions,
  updateRolePermissions
} = require('../controllers/usersController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Public user creation route (no authentication required)
router.post(
  '/public',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(['super_admin', 'sales', 'telecaller']).withMessage('Invalid role')
  ],
  async (req, res, next) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation error', 'validation', errors.array());
      }

      const { name, email, password, role = 'sales' } = req.body;

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
          created_at as "createdAt"
      `;

      const userResult = await db.query(insertQuery, [
        name,
        email,
        passwordHash,
        roleId
      ]);

      const user = {
        ...userResult.rows[0],
        role
      };

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
  }
);


// All other user routes require authentication
router.use(authenticate);

// Get all users (admin only)
router.get('/', getAllUsers);

// Get user by ID (admin or self)
router.get(
  '/:id',
  param('id').isInt().withMessage('User ID must be an integer'),
  getUserById
);

// Create user
router.post(
  '/',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['super_admin', 'sales', 'telecaller']).withMessage('Invalid role')
  ],
  createUser
);

// Update user (admin or self)
router.put(
  '/:id',
  [
    param('id').isInt().withMessage('User ID must be an integer'),
    body('name').optional(),
    body('phone').optional()
  ],
  updateUser
);

// Delete user (admin only)
router.delete(
  '/:id',
  param('id').isInt().withMessage('User ID must be an integer'),
  deleteUser
);

// Update user role (admin only)
router.put(
  '/:id/role',
  [
    param('id').isInt().withMessage('User ID must be an integer'),
    body('role').isIn(['super_admin', 'sales', 'telecaller']).withMessage('Invalid role')
  ],
  updateUserRole
);

// Get role permissions (admin only)
router.get('/roles/permissions', getRolePermissions);

// Update role permissions (admin only)
router.put(
  '/roles/:role/permissions',
  [
    param('role').isIn(['super_admin', 'sales', 'telecaller']).withMessage('Invalid role'),
    body('permissions').isObject().withMessage('Permissions must be an object')
  ],
  updateRolePermissions
);

module.exports = router;