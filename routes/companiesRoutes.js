const express = require('express');
const { body, param, query } = require('express-validator');
const { 
  getAllCompanies, 
  getCompanyById, 
  createCompany, 
  updateCompany, 
  deleteCompany,
  getCompanyCustomers
} = require('../controllers/companiesController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

const router = express.Router();

// All company routes require authentication
router.use(authenticate);

// Get all companies
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  checkPermission('companies', 'read'),
  getAllCompanies
);

// Get company by ID
router.get(
  '/:id',
  [
    param('id').isInt().withMessage('Company ID must be an integer')
  ],
  checkPermission('companies', 'read'),
  getCompanyById
);

// Get all customers belonging to a company
router.get(
  '/:id/customers',
  [
    param('id').isInt().withMessage('Company ID must be an integer')
  ],
  checkPermission('companies', 'read'),
  getCompanyCustomers
);

// Create company
router.post(
  '/',
  [
    body('name').notEmpty().withMessage('Company name is required'),
    body('industry').optional(),
    body('location').optional()
  ],
  checkPermission('companies', 'create'),
  createCompany
);

// Update company
router.put(
  '/:id',
  [
    param('id').isInt().withMessage('Company ID must be an integer'),
    body('name').optional(),
    body('industry').optional(),
    body('location').optional()
  ],
  checkPermission('companies', 'update'),
  updateCompany
);

// Delete company
router.delete(
  '/:id',
  [
    param('id').isInt().withMessage('Company ID must be an integer')
  ],
  checkPermission('companies', 'delete'),
  deleteCompany
);

module.exports = router;