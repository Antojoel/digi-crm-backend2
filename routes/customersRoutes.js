const express = require('express');
const { body, param, query } = require('express-validator');
const { 
  getAllCustomers, 
  getCustomerById, 
  createCustomer, 
  updateCustomer, 
  deleteCustomer,
  getAvailableCustomersForReassignment
} = require('../controllers/customersController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

const router = express.Router();

// All customer routes require authentication
router.use(authenticate);

// Get all customers
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  checkPermission('customers', 'read'),
  getAllCustomers
);

// IMPORTANT: This route must come BEFORE any routes with path parameters like :id
// Get available customers for reassignment
router.get(
  '/available-for-reassignment',
  [
    query('excludeId').optional().isInt().withMessage('Exclude ID must be an integer')
  ],
  checkPermission('customers', 'read'),
  getAvailableCustomersForReassignment
);

// Get customer by ID
router.get(
  '/:id',
  [
    param('id').isInt().withMessage('Customer ID must be an integer')
  ],
  checkPermission('customers', 'read'),
  getCustomerById
);

// Create customer
router.post(
  '/',
  [
    body('name').notEmpty().withMessage('Customer name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phone').optional(),
    body('companyId').isInt().withMessage('Company ID must be an integer')
  ],
  checkPermission('customers', 'create'),
  createCustomer
);

// Update customer
router.put(
  '/:id',
  [
    param('id').isInt().withMessage('Customer ID must be an integer'),
    body('name').optional(),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('phone').optional(),
    body('companyId').optional().isInt().withMessage('Company ID must be an integer')
  ],
  checkPermission('customers', 'update'),
  updateCustomer
);

// Delete customer
router.delete(
  '/:id',
  [
    param('id').isInt().withMessage('Customer ID must be an integer'),
    query('force').optional().isBoolean().withMessage('Force must be a boolean'),
    query('reassignToCustomerId').optional().isInt().withMessage('Reassign customer ID must be an integer')
  ],
  checkPermission('customers', 'delete'),
  deleteCustomer
);

module.exports = router;