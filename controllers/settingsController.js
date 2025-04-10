const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const db = require('../config/db');
const { formatSuccess } = require('../utils/responseFormatter');
const { AppError } = require('../utils/errorHandler');

/**
 * Update user profile
 * PUT /api/settings/profile
 */
const updateProfile = async (req, res, next) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation error', 'validation', errors.array());
    }

    const { name, phone } = req.body;
    const userId = req.user.id;

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

    // Add user ID to values array
    values.push(userId);

    // Update the user profile
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
 * Change password
 * PUT /api/settings/password
 */
const changePassword = async (req, res, next) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation error', 'validation', errors.array());
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user.id;

    // Check if new password and confirm password match
    if (newPassword !== confirmPassword) {
      throw new AppError('New password and confirm password do not match', 'validation');
    }

    // Get current password hash
    const userQuery = 'SELECT password_hash FROM users WHERE id = $1';
    const userResult = await db.query(userQuery, [userId]);

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);

    if (!isPasswordValid) {
      throw new AppError('Current password is incorrect', 'authentication');
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Update the password
    const updateQuery = `
      UPDATE users
      SET password_hash = $1, updated_at = NOW()
      WHERE id = $2
    `;

    await db.query(updateQuery, [passwordHash, userId]);

    // Invalidate all existing sessions except the current one
    const token = req.headers.authorization.split(' ')[1];
    
    const deleteSessionsQuery = `
      DELETE FROM user_sessions
      WHERE user_id = $1 AND token != $2
    `;
    
    await db.query(deleteSessionsQuery, [userId, token]);

    const { response, statusCode } = formatSuccess(
      null,
      'Password updated successfully'
    );

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Get notification settings
 * GET /api/settings/notifications
 */
const getNotificationSettings = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get notification settings
    const query = `
      SELECT 
        email_notifications as "emailNotifications",
        lead_updates as "leadUpdates",
        customer_activities as "customerActivities",
        marketing_updates as "marketingUpdates"
      FROM 
        notification_settings
      WHERE 
        user_id = $1
    `;

    const result = await db.query(query, [userId]);

    // If no settings exist, create default settings
    if (result.rows.length === 0) {
      const insertQuery = `
        INSERT INTO notification_settings (user_id)
        VALUES ($1)
        RETURNING 
          email_notifications as "emailNotifications",
          lead_updates as "leadUpdates",
          customer_activities as "customerActivities",
          marketing_updates as "marketingUpdates"
      `;

      const insertResult = await db.query(insertQuery, [userId]);
      
      const { response, statusCode } = formatSuccess({
        notifications: insertResult.rows[0]
      });
      
      res.status(statusCode).json(response);
    } else {
      const { response, statusCode } = formatSuccess({
        notifications: result.rows[0]
      });
      
      res.status(statusCode).json(response);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Update notification settings
 * PUT /api/settings/notifications
 */
const updateNotificationSettings = async (req, res, next) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation error', 'validation', errors.array());
    }

    const { notifications } = req.body;
    const userId = req.user.id;

    if (!notifications || typeof notifications !== 'object') {
      throw new AppError('Valid notifications object is required', 'validation');
    }

    const { 
      emailNotifications, 
      leadUpdates, 
      customerActivities, 
      marketingUpdates 
    } = notifications;

    // Build update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (emailNotifications !== undefined) {
      updates.push(`email_notifications = ${paramIndex++}`);
      values.push(emailNotifications);
    }

    if (leadUpdates !== undefined) {
      updates.push(`lead_updates = ${paramIndex++}`);
      values.push(leadUpdates);
    }

    if (customerActivities !== undefined) {
      updates.push(`customer_activities = ${paramIndex++}`);
      values.push(customerActivities);
    }

    if (marketingUpdates !== undefined) {
      updates.push(`marketing_updates = ${paramIndex++}`);
      values.push(marketingUpdates);
    }

    // Add updated_at timestamp
    updates.push(`updated_at = NOW()`);

    if (updates.length === 0) {
      throw new AppError('No update fields provided', 'validation');
    }

    // Add user ID to values array
    values.push(userId);

    // Check if settings exist
    const checkQuery = 'SELECT id FROM notification_settings WHERE user_id = $1';
    const checkResult = await db.query(checkQuery, [userId]);

    let result;
    
    if (checkResult.rows.length === 0) {
      // Create new settings if they don't exist
      const columns = [];
      const placeholders = [];
      
      if (emailNotifications !== undefined) {
        columns.push('email_notifications');
        placeholders.push('$1');
        values.unshift(emailNotifications);
      }
      
      if (leadUpdates !== undefined) {
        columns.push('lead_updates');
        placeholders.push('$2');
        values.unshift(leadUpdates);
      }
      
      if (customerActivities !== undefined) {
        columns.push('customer_activities');
        placeholders.push('$3');
        values.unshift(customerActivities);
      }
      
      if (marketingUpdates !== undefined) {
        columns.push('marketing_updates');
        placeholders.push('$4');
        values.unshift(marketingUpdates);
      }
      
      // Add user_id
      columns.push('user_id');
      placeholders.push(`${values.length + 1}`);
      
      const insertQuery = `
        INSERT INTO notification_settings (${columns.join(', ')})
        VALUES (${placeholders.join(', ')})
        RETURNING 
          email_notifications as "emailNotifications",
          lead_updates as "leadUpdates",
          customer_activities as "customerActivities",
          marketing_updates as "marketingUpdates",
          updated_at as "updatedAt"
      `;
      
      result = await db.query(insertQuery, [...values, userId]);
    } else {
      // Update existing settings
      const updateQuery = `
        UPDATE notification_settings
        SET ${updates.join(', ')}
        WHERE user_id = ${paramIndex}
        RETURNING 
          email_notifications as "emailNotifications",
          lead_updates as "leadUpdates",
          customer_activities as "customerActivities",
          marketing_updates as "marketingUpdates",
          updated_at as "updatedAt"
      `;
      
      result = await db.query(updateQuery, values);
    }

    const { response, statusCode } = formatSuccess({
      notifications: result.rows[0]
    });
    
    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Update security settings
 * PUT /api/settings/security
 */
const updateSecuritySettings = async (req, res, next) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation error', 'validation', errors.array());
    }

    const { twoFactorEnabled } = req.body;
    const userId = req.user.id;

    if (twoFactorEnabled === undefined) {
      throw new AppError('Two-factor authentication setting is required', 'validation');
    }

    // Update security settings
    const updateQuery = `
      UPDATE users
      SET two_factor_enabled = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING 
        two_factor_enabled as "twoFactorEnabled",
        updated_at as "updatedAt"
    `;

    const result = await db.query(updateQuery, [twoFactorEnabled, userId]);

    const { response, statusCode } = formatSuccess({
      security: result.rows[0]
    });
    
    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateProfile,
  changePassword,
  getNotificationSettings,
  updateNotificationSettings,
  updateSecuritySettings
};