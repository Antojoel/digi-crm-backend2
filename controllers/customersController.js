const { validationResult } = require('express-validator');
const db = require('../config/db');
const { formatSuccess } = require('../utils/responseFormatter');
const { AppError } = require('../utils/errorHandler');

/**
 * Get all customers with optional filtering
 * GET /api/customers
 */
const getAllCustomers = async (req, res, next) => {
  try {
    // Extract query parameters
    const { page = 1, limit = 10, search = null } = req.query;
    const offset = (page - 1) * limit;

    // Build base query
    let query = `
      SELECT 
        c.id,
        c.name,
        c.email,
        c.phone,
        c.company_id as "companyId",
        c.created_by as "createdBy",
        c.created_at as "createdAt",
        json_build_object(
          'id', co.id,
          'name', co.name,
          'industry', co.industry
        ) as company
      FROM 
        customers c
      JOIN 
        companies co ON c.company_id = co.id
      WHERE 
        c.deleted_at IS NULL
    `;

    const queryParams = [];
    let paramIndex = 1;

    // Apply search filter if provided
    if (search) {
      query += ` AND (
        c.name ILIKE $${paramIndex}
        OR c.email ILIKE $${paramIndex}
        OR c.phone ILIKE $${paramIndex}
        OR co.name ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Filter by user if not a super_admin
    if (req.user.role !== 'super_admin') {
      query += ` AND c.created_by = $${paramIndex}`;
      queryParams.push(req.user.id);
      paramIndex++;
    }

    // Count total customers for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM (${query}) as filtered_customers
    `;

    const countResult = await db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    // Add pagination to the main query
    query += ` ORDER BY c.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    // Execute the query
    const customersResult = await db.query(query, queryParams);

    // Format response with pagination info
    const { response, statusCode } = formatSuccess({
      customers: customersResult.rows,
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
 * Get a customer by ID
 * GET /api/customers/:id
 */
const getCustomerById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get customer data with company info and associated leads
    const query = `
      SELECT 
        c.id,
        c.name,
        c.email,
        c.phone,
        c.company_id as "companyId",
        c.created_by as "createdBy",
        c.created_at as "createdAt",
        json_build_object(
          'id', co.id,
          'name', co.name,
          'industry', co.industry,
          'location', co.location
        ) as company,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', l.id, 
                'dealName', l.deal_name, 
                'amount', l.amount, 
                'stage', l.stage
              )
            )
            FROM leads l
            WHERE l.customer_id = c.id AND l.deleted_at IS NULL
          ),
          '[]'
        ) as leads
      FROM 
        customers c
      JOIN 
        companies co ON c.company_id = co.id
      WHERE 
        c.id = $1 AND c.deleted_at IS NULL
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      throw new AppError('Customer not found', 'not_found');
    }

    // Check permission if not a super_admin and not the owner
    if (req.user.role !== 'super_admin' && result.rows[0].createdBy !== req.user.id) {
      if (!req.user.permissions.customers.includes('read')) {
        throw new AppError('You do not have permission to view this customer', 'authorization');
      }
    }

    const { response, statusCode } = formatSuccess({
      customer: result.rows[0]
    });

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new customer
 * POST /api/customers
 */
const createCustomer = async (req, res, next) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation error', 'validation', errors.array());
    }

    // Extract customer data from request body
    const { 
      name, 
      email, 
      phone, 
      companyId
    } = req.body;

    // Insert the customer
    const insertQuery = `
      INSERT INTO customers (
        name, 
        email, 
        phone, 
        company_id, 
        created_by
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING 
        id, 
        name, 
        email, 
        phone, 
        company_id as "companyId", 
        created_by as "createdBy", 
        created_at as "createdAt"
    `;

    const customerResult = await db.query(insertQuery, [
      name,
      email,
      phone,
      companyId,
      req.user.id
    ]);

    const { response, statusCode } = formatSuccess(
      { customer: customerResult.rows[0] },
      'Customer created successfully',
      201
    );

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Update a customer
 * PUT /api/customers/:id
 */
const updateCustomer = async (req, res, next) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation error', 'validation', errors.array());
    }

    const { id } = req.params;
    
    // Check if customer exists
    const checkQuery = `
      SELECT * FROM customers 
      WHERE id = $1 AND deleted_at IS NULL
    `;
    
    const checkResult = await db.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      throw new AppError('Customer not found', 'not_found');
    }
    
    const customer = checkResult.rows[0];
    
    // Check permission if not a super_admin and not the owner
    if (req.user.role !== 'super_admin' && customer.created_by !== req.user.id) {
      if (!req.user.permissions.customers.includes('update')) {
        throw new AppError('You do not have permission to update this customer', 'authorization');
      }
    }
    
    // Extract updatable fields
    const {
      name,
      email,
      phone,
      companyId
    } = req.body;
    
    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email);
    }
    
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(phone);
    }
    
    if (companyId !== undefined) {
      updates.push(`company_id = $${paramIndex++}`);
      values.push(companyId);
    }    
    
    // Add updated_at timestamp
    updates.push(`updated_at = NOW()`);
    
    if (updates.length === 0) {
      throw new AppError('No update fields provided', 'validation');
    }
    
    // Add ID to the values array
    values.push(id);
    
    // Update the customer
    const updateQuery = `
    UPDATE customers
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING 
      id, 
      name, 
      email, 
      phone, 
      company_id as "companyId", 
      created_by as "createdBy",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `;
    const customerResult = await db.query(updateQuery, values);
    
    const { response, statusCode } = formatSuccess({
      customer: customerResult.rows[0]
    });
    
    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a customer
 * DELETE /api/customers/:id
 */
const deleteCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { force, reassignToCustomerId } = req.query;
    
    // Check if customer exists
    const checkQuery = `
      SELECT * FROM customers 
      WHERE id = $1 AND deleted_at IS NULL
    `;
    
    const checkResult = await db.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      throw new AppError('Customer not found', 'not_found');
    }
    
    const customer = checkResult.rows[0];
    
    // Check permission if not a super_admin and not the owner
    if (req.user.role !== 'super_admin' && customer.created_by !== req.user.id) {
      if (!req.user.permissions.customers.includes('delete')) {
        throw new AppError('You do not have permission to delete this customer', 'authorization');
      }
    }
    
    // Check if customer has associated leads
    const leadsQuery = `
      SELECT COUNT(*) as lead_count 
      FROM leads 
      WHERE customer_id = $1 AND deleted_at IS NULL
    `;
    
    const leadsResult = await db.query(leadsQuery, [id]);
    const leadCount = parseInt(leadsResult.rows[0].lead_count);
    
    if (leadCount > 0) {
      // If force delete is enabled
      if (force === 'true') {
        // Check if reassign customer is provided and valid
        if (reassignToCustomerId) {
          // Verify that the target customer exists
          const targetCustomerQuery = `
            SELECT id FROM customers 
            WHERE id = $1 AND deleted_at IS NULL
          `;
          
          const targetCustomerResult = await db.query(targetCustomerQuery, [reassignToCustomerId]);
          
          if (targetCustomerResult.rows.length === 0) {
            throw new AppError('Target customer for reassignment not found', 'validation');
          }
          
          // Start a transaction
          const client = await db.pool.connect();
          
          try {
            await client.query('BEGIN');
            
            // Reassign all leads to the new customer
            const reassignQuery = `
              UPDATE leads
              SET customer_id = $1, updated_at = NOW()
              WHERE customer_id = $2 AND deleted_at IS NULL
            `;
            
            await client.query(reassignQuery, [reassignToCustomerId, id]);
            
            // Soft delete the original customer
            const deleteQuery = `
              UPDATE customers
              SET deleted_at = NOW()
              WHERE id = $1
            `;
            
            await client.query(deleteQuery, [id]);
            
            await client.query('COMMIT');
            
            const { response, statusCode } = formatSuccess(
              null,
              `Customer deleted successfully. ${leadCount} leads reassigned to customer ID ${reassignToCustomerId}`
            );
            
            return res.status(statusCode).json(response);
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        } else {
          // If no reassignment target provided but force is true, 
          // delete the associated leads
          const client = await db.pool.connect();
          
          try {
            await client.query('BEGIN');
            
            // Soft delete all leads associated with this customer
            const deleteLeadsQuery = `
              UPDATE leads
              SET deleted_at = NOW()
              WHERE customer_id = $1 AND deleted_at IS NULL
            `;
            
            await client.query(deleteLeadsQuery, [id]);
            
            // Soft delete the customer
            const deleteCustomerQuery = `
              UPDATE customers
              SET deleted_at = NOW()
              WHERE id = $1
            `;
            
            await client.query(deleteCustomerQuery, [id]);
            
            await client.query('COMMIT');
            
            const { response, statusCode } = formatSuccess(
              null,
              `Customer and ${leadCount} associated leads deleted successfully`
            );
            
            return res.status(statusCode).json(response);
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        }
      } else {
        // If not force deleting, provide information about associated leads
        const detailedLeadsQuery = `
          SELECT id, deal_name as "dealName", amount, stage
          FROM leads
          WHERE customer_id = $1 AND deleted_at IS NULL
          LIMIT 5
        `;
        
        const detailedLeadsResult = await db.query(detailedLeadsQuery, [id]);
        
        // Prepare a helpful error message
        const errorMessage = 'Cannot delete customer with associated leads';
        const additionalInfo = {
          totalLeads: leadCount,
          sampleLeads: detailedLeadsResult.rows,
          solutions: [
            "Use '?force=true' to delete the customer and all associated leads",
            "Use '?force=true&reassignToCustomerId=X' to reassign leads to another customer"
          ]
        };
        
        throw new AppError(errorMessage, 'validation', additionalInfo);
      }
    }
    
    // If no associated leads, proceed with normal deletion
    const deleteQuery = `
      UPDATE customers
      SET deleted_at = NOW()
      WHERE id = $1
    `;
    
    await db.query(deleteQuery, [id]);
    
    const { response, statusCode } = formatSuccess(
      null,
      'Customer deleted successfully'
    );
    
    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all available customers for reassignment
 * GET /api/customers/available-for-reassignment
 */
const getAvailableCustomersForReassignment = async (req, res, next) => {
  try {
    // Get the customer ID to exclude (the one being deleted)
    const { excludeId } = req.query;
    
    // Build query to get all active customers except the one being deleted
    let query = `
      SELECT 
        c.id,
        c.name,
        c.email,
        c.phone,
        json_build_object(
          'id', co.id,
          'name', co.name
        ) as company
      FROM 
        customers c
      JOIN
        companies co ON c.company_id = co.id
      WHERE 
        c.deleted_at IS NULL
    `;
    
    const queryParams = [];
    let paramIndex = 1;
    
    if (excludeId) {
      query += ` AND c.id != $${paramIndex}`;
      queryParams.push(excludeId);
      paramIndex++;
    }
    
    // Filter by user if not a super_admin
    if (req.user.role !== 'super_admin') {
      query += ` AND c.created_by = $${paramIndex}`;
      queryParams.push(req.user.id);
      paramIndex++;
    }
    
    // Order by name for easier selection
    query += ` ORDER BY c.name ASC`;
    
    // Execute the query
    const customersResult = await db.query(query, queryParams);
    
    // Format response
    const { response, statusCode } = formatSuccess({
      customers: customersResult.rows
    });
    
    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getAvailableCustomersForReassignment
};