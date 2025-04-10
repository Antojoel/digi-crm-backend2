const express = require('express');
const { body } = require('express-validator');
const { 
  updateProfile, 
  changePassword, 
  getNotificationSettings, 
  updateNotificationSettings,
  updateSecuritySettings
} = require('../controllers/settingsController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All settings routes require authentication
router.use(authenticate);

// Update user profile
router.put(
  '/profile',
  [
    body('name').optional(),
    body('phone').optional()
  ],
  updateProfile
);

// Change password
router.put(
  '/password',
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
    body('confirmPassword').notEmpty().withMessage('Confirm password is required')
  ],
  changePassword
);

// Get notification settings
router.get('/notifications', getNotificationSettings);

// Update notification settings
router.put(
  '/notifications',
  [
    body('notifications').isObject().withMessage('Notifications must be an object'),
    body('notifications.emailNotifications').optional().isBoolean().withMessage('Email notifications must be a boolean'),
    body('notifications.leadUpdates').optional().isBoolean().withMessage('Lead updates must be a boolean'),
    body('notifications.customerActivities').optional().isBoolean().withMessage('Customer activities must be a boolean'),
    body('notifications.marketingUpdates').optional().isBoolean().withMessage('Marketing updates must be a boolean')
  ],
  updateNotificationSettings
);

// Update security settings
router.put(
  '/security',
  [
    body('twoFactorEnabled').isBoolean().withMessage('Two-factor authentication setting must be a boolean')
  ],
  updateSecuritySettings
);

module.exports = router;