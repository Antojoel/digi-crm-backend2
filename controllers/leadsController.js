const { validationResult } = require("express-validator");
const db = require("../config/db");
const { formatSuccess, formatError } = require("../utils/responseFormatter");
const { AppError } = require("../utils/errorHandler");

/**
 * Get all leads with optional filtering
 * GET /api/leads
 */
const getAllLeads = async (req, res, next) => {
  try {
    // Extract query parameters
    const { page = 1, limit = 10, stage = null, search = null } = req.query;
    const offset = (page - 1) * limit;

    // Build base query
    let query = `
      SELECT 
        l.id,
        l.deal_name as "dealName",
        l.amount,
        l.product,
        l.stage,
        l.date,
        l.customer_id as "customerId",
        l.created_by as "createdBy",
        l.attained_through as "attainedThrough",
        l.document_url as "documentUrl",
        json_build_object(
          'id', c.id,
          'name', c.name,
          'companyId', c.company_id,
          'company', json_build_object(
            'id', co.id,
            'name', co.name
          )
        ) as customer
      FROM 
        leads l
      JOIN 
        customers c ON l.customer_id = c.id
      JOIN 
        companies co ON c.company_id = co.id
      WHERE 
        l.deleted_at IS NULL
    `;

    const queryParams = [];
    let paramIndex = 1;

    // Apply filters if provided
    if (stage) {
      query += ` AND l.stage = $${paramIndex}`;
      queryParams.push(stage);
      paramIndex++;
    }

    if (search) {
      query += ` AND (
        l.deal_name ILIKE $${paramIndex}
        OR l.product ILIKE $${paramIndex}
        OR c.name ILIKE $${paramIndex}
        OR co.name ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Filter by user if not a super_admin
    if (req.user.role !== "super_admin") {
      query += ` AND l.created_by = $${paramIndex}`;
      queryParams.push(req.user.id);
      paramIndex++;
    }

    // Count total leads for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM (${query}) as filtered_leads
    `;

    const countResult = await db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    // Add pagination to the main query
    query += ` ORDER BY l.created_at DESC LIMIT $${paramIndex} OFFSET $${
      paramIndex + 1
    }`;
    queryParams.push(limit, offset);

    // Execute the query
    const leadsResult = await db.query(query, queryParams);

    // Format response with pagination info
    const { response, statusCode } = formatSuccess({
      leads: leadsResult.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages,
      },
    });

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Get a lead by ID
 * GET /api/leads/:id
 */
const getLeadById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get lead data with customer and company info
    const query = `
      SELECT 
        l.id,
        l.deal_name as "dealName",
        l.amount,
        l.product,
        l.stage,
        l.date,
        l.customer_id as "customerId",
        l.created_by as "createdBy",
        l.attained_through as "attainedThrough",
        l.document_url as "documentUrl",
        l.notes,
        json_build_object(
          'id', c.id,
          'name', c.name,
          'email', c.email,
          'phone', c.phone,
          'companyId', c.company_id,
          'company', json_build_object(
            'id', co.id,
            'name', co.name,
            'industry', co.industry,
            'location', co.location
          )
        ) as customer
      FROM 
        leads l
      JOIN 
        customers c ON l.customer_id = c.id
      JOIN 
        companies co ON c.company_id = co.id
      WHERE 
        l.id = $1 AND l.deleted_at IS NULL
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      throw new AppError("Lead not found", "not_found");
    }

    // Check permission if not a super_admin and not the owner
    if (
      req.user.role !== "super_admin" &&
      result.rows[0].createdBy !== req.user.id
    ) {
      if (!req.user.permissions.leads.includes("read")) {
        throw new AppError(
          "You do not have permission to view this lead",
          "authorization"
        );
      }
    }

    const { response, statusCode } = formatSuccess({
      lead: result.rows[0],
    });

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new lead
 * POST /api/leads
 */
const createLead = async (req, res, next) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError("Validation error", "validation", errors.array());
    }

    // Extract lead data from request body
    const {
      dealName,
      amount,
      product,
      stage = "new",
      date,
      customerId,
      attainedThrough,
      documentUrl,
      notes,
    } = req.body;

    // Start a transaction
    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      // Insert the lead
      const insertQuery = `
        INSERT INTO leads (
          deal_name, 
          amount, 
          product, 
          stage, 
          date, 
          customer_id, 
          created_by, 
          attained_through, 
          document_url,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING 
          id, 
          deal_name as "dealName", 
          amount, 
          product, 
          stage, 
          date, 
          customer_id as "customerId", 
          created_by as "createdBy", 
          attained_through as "attainedThrough", 
          document_url as "documentUrl",
          notes,
          created_at as "createdAt"
      `;

      const leadResult = await client.query(insertQuery, [
        dealName,
        amount,
        product,
        stage,
        date,
        customerId,
        req.user.id,
        attainedThrough,
        documentUrl,
        notes,
      ]);

      // Add lead activity for creation
      await client.query(`SELECT add_lead_activity($1, $2, $3, $4, $5, $6)`, [
        leadResult.rows[0].id,
        req.user.id,
        "created",
        "Lead created",
        null,
        JSON.stringify({ stage }),
      ]);

      await client.query("COMMIT");

      const { response, statusCode } = formatSuccess(
        { lead: leadResult.rows[0] },
        "Lead created successfully",
        201
      );

      res.status(statusCode).json(response);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Update a lead
 * PUT /api/leads/:id
 */
const updateLead = async (req, res, next) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError("Validation error", "validation", errors.array());
    }

    const { id } = req.params;

    // Check if lead exists
    const checkQuery = `
      SELECT * FROM leads 
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const checkResult = await db.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      throw new AppError("Lead not found", "not_found");
    }

    const lead = checkResult.rows[0];

    // Authorization check
    if (req.user.role !== "super_admin" && lead.created_by !== req.user.id) {
      if (!req.user.permissions.leads.includes("update")) {
        throw new AppError(
          "You do not have permission to update this lead",
          "authorization"
        );
      }
    }

    // Extract updatable fields
    const {
      dealName,
      amount,
      product,
      stage,
      date,
      customerId,
      attainedThrough,
      documentUrl,
      notes,
    } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (dealName !== undefined) {
      updates.push(`deal_name = $${paramIndex++}`);
      values.push(dealName);
    }
    if (amount !== undefined) {
      updates.push(`amount = $${paramIndex++}`);
      values.push(amount);
    }
    if (product !== undefined) {
      updates.push(`product = $${paramIndex++}`);
      values.push(product);
    }
    if (stage !== undefined) {
      updates.push(`stage = $${paramIndex++}`);
      values.push(stage);
    }
    if (date !== undefined) {
      updates.push(`date = $${paramIndex++}`);
      values.push(date);
    }
    if (customerId !== undefined) {
      updates.push(`customer_id = $${paramIndex++}`);
      values.push(customerId);
    }
    if (attainedThrough !== undefined) {
      updates.push(`attained_through = $${paramIndex++}`);
      values.push(attainedThrough);
    }
    if (documentUrl !== undefined) {
      updates.push(`document_url = $${paramIndex++}`);
      values.push(documentUrl);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(notes);
    }

    // Always update timestamp
    updates.push(`updated_at = NOW()`);

    if (updates.length === 0) {
      throw new AppError("No update fields provided", "validation");
    }

    // Add ID to the end for WHERE clause
    values.push(id);

    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      const updateQuery = `
        UPDATE leads
        SET ${updates.join(", ")}
        WHERE id = $${paramIndex}
        RETURNING 
          id, 
          deal_name as "dealName", 
          amount, 
          product, 
          stage, 
          date, 
          customer_id as "customerId", 
          created_by as "createdBy", 
          attained_through as "attainedThrough", 
          document_url as "documentUrl",
          notes,
          updated_at as "updatedAt"
      `;

      const leadResult = await client.query(updateQuery, values);

      await client.query("COMMIT");

      const { response, statusCode } = formatSuccess({
        lead: leadResult.rows[0],
      });

      res.status(statusCode).json(response);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a lead
 * DELETE /api/leads/:id
 */
const deleteLead = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if lead exists
    const checkQuery = `
      SELECT * FROM leads 
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const checkResult = await db.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      throw new AppError("Lead not found", "not_found");
    }

    const lead = checkResult.rows[0];

    // Check permission if not a super_admin and not the owner
    if (req.user.role !== "super_admin" && lead.created_by !== req.user.id) {
      if (!req.user.permissions.leads.includes("delete")) {
        throw new AppError(
          "You do not have permission to delete this lead",
          "authorization"
        );
      }
    }

    // Soft delete the lead
    const deleteQuery = `
      UPDATE leads
      SET deleted_at = NOW()
      WHERE id = $1
    `;

    await db.query(deleteQuery, [id]);

    const { response, statusCode } = formatSuccess(
      null,
      "Lead deleted successfully"
    );

    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
};
