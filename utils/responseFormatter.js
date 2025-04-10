/**
 * Standard success response format for API responses
 * 
 * @param {any} data - The data to be included in the response
 * @param {string} message - Optional message to include in the response
 * @param {number} statusCode - HTTP status code, defaults to 200
 * @returns {Object} Formatted success response object
 */
const formatSuccess = (data, message = null, statusCode = 200) => {
    const response = {
      success: true
    };
  
    // Add data if provided
    if (data) {
      response.data = data;
    }
  
    // Add message if provided
    if (message) {
      response.message = message;
    }
  
    return { response, statusCode };
  };
  
  /**
   * Standard error response format for API responses
   * 
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code, defaults to 400
   * @param {any} errors - Optional detailed errors
   * @returns {Object} Formatted error response object
   */
  const formatError = (message, statusCode = 400, errors = null) => {
    const response = {
      success: false,
      error: message
    };
  
    // Add detailed errors if provided
    if (errors) {
      response.errors = errors;
    }
  
    return { response, statusCode };
  };
  
  module.exports = {
    formatSuccess,
    formatError
  };