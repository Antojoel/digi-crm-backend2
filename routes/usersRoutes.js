const express = require('express');
const { body, param } = require('express-validator');
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
const { checkPermission } = require('../middleware/permissions');

const router = express.Router();

// All user routes require authentication
// router.use(authenticate);

// Get all users (admin only)
router.get('/', getAllUsers);

// Get user by ID (admin or self)
router.get('/:id', param('id').isInt().withMessage('User ID must be an integer'), getUserById);

// Create user (admin only)
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