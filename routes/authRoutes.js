const express = require('express');
const { body } = require('express-validator');
const { login, logout, getCurrentUser, register } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Login route
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  login
);

// Register route
router.post(
  '/register',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  register
);

// Logout route (requires authentication)
router.post('/logout', authenticate, logout);

// Get current user route (requires authentication)
router.get('/me', authenticate, getCurrentUser);

module.exports = router;