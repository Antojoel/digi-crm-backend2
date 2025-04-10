const { formatError } = require('./responseFormatter');

/**
 * Global error handler middleware for Express
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error message and status
  let message = 'Internal server error';
  let statusCode = 500;

  // Handle specific error types
  if (err.type === 'validation') {
    message = 'Validation error';
    statusCode = 400;
  } else if (err.type === 'authentication') {
    message = err.message || 'Authentication error';
    statusCode = 401;
  } else if (err.type === 'authorization') {
    message = err.message || 'You do not have permission to perform this action';
    statusCode = 403;
  } else if (err.type === 'not_found') {
    message = err.message || 'Resource not found';
    statusCode = 404;
  } else if (err.message) {
    message = err.message;
  }

  // Format the error response
  const { response } = formatError(message, statusCode, err.errors);

  // Send the response
  res.status(statusCode).json(response);
};

/**
 * Custom error class for a consistent error handling approach
 */
class AppError extends Error {
  constructor(message, type = 'general', errors = null) {
    super(message);
    this.type = type;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  errorHandler,
  AppError
};