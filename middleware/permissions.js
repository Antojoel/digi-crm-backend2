const { AppError } = require('../utils/errorHandler');

/**
 * Middleware to check if the user has the required permissions
 * @param {string} resource - The resource to check permissions for
 * @param {string} action - The action to check permissions for
 * @returns {Function} Express middleware function
 */
const checkPermission = (resource, action) => {
  return (req, res, next) => {
    try {
      // Super admin role has all permissions
      if (req.user.role === 'super_admin') {
        return next();
      }

      // Check if the user has the required permission
      const hasPermission = req.user.permissions[resource] && 
                          req.user.permissions[resource].includes(action);

      if (!hasPermission) {
        throw new AppError(
          `You don't have permission to ${action} ${resource}`,
          'authorization'
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  checkPermission
};