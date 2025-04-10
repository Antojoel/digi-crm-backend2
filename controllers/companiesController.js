const { validationResult } = require('express-validator');
const db = require('../config/db');
const { formatSuccess } = require('../utils/responseFormatter');
const { AppError } = require('../utils/errorHandler');

/**
 * Get all companies with optional filtering
 * GET /api/companies
 */
const getAllCompanies = async (req, res, next) => {
  try {
    // Extract query parameters
    const { page = 1, limit = 10, search = null } = req.query;
    const offset = (page - 1) * limit;

    // Build base query
    let query = `
      SELECT 
        id,
        name,
        industry,
        location,
        created_by as "createdBy",
        created_at as "createdAt"
      FROM 
        companies
      WHERE 
        deleted_at IS NULL
    `;

    const queryParams = [];
    let paramIndex = 1;

    // Apply search filter if provided
    if (search) {
      query += ` AND (
        name ILIKE $${paramIndex}
        OR industry ILIKE $${paramIndex}
        OR location ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Filter by user if not a super_admin
    if (req.user.role !== 'super_admin') {
      query += ` AND created_by = $${paramIndex}`;
      queryParams.push(req.user.id);
      paramIndex++;
    }

    // Count total companies for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM (${query}) as filtered_companies
    `;

    const countResult = await db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    // Add pagination to the main query
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    // Execute the query
    const companiesResult = await db.query(query, queryParams);

    // Format response with pagination info
    const { response, statusCode } = formatSuccess({
      companies: companiesResult.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages
      }
    });

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Get a company by ID
 * GET /api/companies/:id
 */
const getCompanyById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get company data with associated customers
    const query = `
      SELECT 
        c.id,
        c.name,
        c.industry,
        c.location,
        c.created_by as "createdBy",
        c.created_at as "createdAt",
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', cu.id, 
                'name', cu.name, 
                'email', cu.email
              )
            )
            FROM customers cu
            WHERE cu.company_id = c.id AND cu.deleted_at IS NULL
          ),
          '[]'
        ) as customers
      FROM 
        companies c
      WHERE 
        c.id = $1 AND c.deleted_at IS NULL
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      throw new AppError('Company not found', 'not_found');
    }

    // Check permission if not a super_admin and not the owner
    if (req.user.role !== 'super_admin' && result.rows[0].createdBy !== req.user.id) {
      if (!req.user.permissions.companies.includes('read')) {
        throw new AppError('You do not have permission to view this company', 'authorization');
      }
    }

    const { response, statusCode } = formatSuccess({
      company: result.rows[0]
    });

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new company
 * POST /api/companies
 */
const createCompany = async (req, res, next) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation error', 'validation', errors.array());
    }

    // Extract company data from request body
    const { 
      name, 
      industry, 
      location
    } = req.body;

    // Insert the company
    const insertQuery = `
      INSERT INTO companies (
        name, 
        industry, 
        location, 
        created_by
      ) VALUES ($1, $2, $3, $4)
      RETURNING 
        id, 
        name, 
        industry, 
        location, 
        created_by as "createdBy", 
        created_at as "createdAt"
    `;

    const companyResult = await db.query(insertQuery, [
      name,
      industry,
      location,
      req.user.id
    ]);

    const { response, statusCode } = formatSuccess(
      { company: companyResult.rows[0] },
      'Company created successfully',
      201
    );

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Update a company
 * PUT /api/companies/:id
 */
const updateCompany = async (req, res, next) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation error', 'validation', errors.array());
    }

    const { id } = req.params;
    
    // Check if company exists
    const checkQuery = `
      SELECT * FROM companies 
      WHERE id = $1 AND deleted_at IS NULL
    `;
    
    const checkResult = await db.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      throw new AppError('Company not found', 'not_found');
    }
    
    const company = checkResult.rows[0];
    
    // Check permission if not a super_admin and not the owner
    if (req.user.role !== 'super_admin' && company.created_by !== req.user.id) {
      if (!req.user.permissions.companies.includes('update')) {
        throw new AppError('You do not have permission to update this company', 'authorization');
      }
    }
    
    // Extract updatable fields
    const {
      name,
      industry,
      location
    } = req.body;
    
    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    
    if (industry !== undefined) {
      updates.push(`industry = $${paramIndex++}`);
      values.push(industry);
    }
    
    if (location !== undefined) {
      updates.push(`location = $${paramIndex++}`);
      values.push(location);
    }
    
    // Add updated_at timestamp
    updates.push(`updated_at = NOW()`);
    
    if (updates.length === 0) {
      throw new AppError('No update fields provided', 'validation');
    }
    
    // Add ID to the values array
    values.push(id);
    
    // Update the company
    const updateQuery = `
      UPDATE companies
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING 
        id, 
        name, 
        industry, 
        location, 
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;
    
    const companyResult = await db.query(updateQuery, values);
    
    const { response, statusCode } = formatSuccess({
      company: companyResult.rows[0]
    });
    
    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a company
 * DELETE /api/companies/:id
 */
const deleteCompany = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if company exists
    const checkQuery = `
      SELECT * FROM companies 
      WHERE id = $1 AND deleted_at IS NULL
    `;
    
    const checkResult = await db.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      throw new AppError('Company not found', 'not_found');
    }
    
    const company = checkResult.rows[0];
    
    // Check permission if not a super_admin and not the owner
    if (req.user.role !== 'super_admin' && company.created_by !== req.user.id) {
      if (!req.user.permissions.companies.includes('delete')) {
        throw new AppError('You do not have permission to delete this company', 'authorization');
      }
    }
    
    // Check if company has associated customers
    const customersQuery = `
      SELECT COUNT(*) as customer_count 
      FROM customers 
      WHERE company_id = $1 AND deleted_at IS NULL
    `;
    
    const customersResult = await db.query(customersQuery, [id]);
    
    if (parseInt(customersResult.rows[0].customer_count) > 0) {
      throw new AppError('Cannot delete company with associated customers', 'validation');
    }
    
    // Soft delete the company
    const deleteQuery = `
      UPDATE companies
      SET deleted_at = NOW()
      WHERE id = $1
    `;
    
    await db.query(deleteQuery, [id]);
    
    const { response, statusCode } = formatSuccess(
      null,
      'Company deleted successfully'
    );
    
    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all customers belonging to a company
 * GET /api/companies/:id/customers
 */
const getCompanyCustomers = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if company exists
    const checkQuery = `
      SELECT * FROM companies 
      WHERE id = $1 AND deleted_at IS NULL
    `;
    
    const checkResult = await db.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      throw new AppError('Company not found', 'not_found');
    }
    
    // Get all customers belonging to the company
    const customersQuery = `
      SELECT 
        id,
        name,
        email,
        phone,
        created_at as "createdAt"
      FROM 
        customers
      WHERE 
        company_id = $1 AND deleted_at IS NULL
      ORDER BY
        created_at DESC
    `;
    
    const customersResult = await db.query(customersQuery, [id]);
    
    const { response, statusCode } = formatSuccess({
      customers: customersResult.rows
    });
    
    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
  getCompanyCustomers
};