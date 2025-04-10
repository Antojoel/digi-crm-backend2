const db = require('../config/db');
const { formatSuccess } = require('../utils/responseFormatter');
const { AppError } = require('../utils/errorHandler');

/**
 * Get dashboard statistics
 * GET /api/dashboard/stats
 */
const getDashboardStats = async (req, res, next) => {
  try {
    // Call the get_dashboard_stats function from the DB
    const statsResult = await db.query(
      'SELECT * FROM get_dashboard_stats($1)',
      [req.user.id]
    );

    const stats = statsResult.rows[0];

    // Calculate growth rates (for demo purposes using static values)
    // In a real application, you would calculate this from historical data
    const growthRates = {
      leads: 12,
      customers: 8,
      companies: -3,
      pipelineValue: 5
    };

    // Add growth rates to stats
    const data = {
      ...stats,
      growthRates
    };

    // Send the response
    const { response, statusCode } = formatSuccess(data);
    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Get pipeline stage distribution
 * GET /api/dashboard/pipeline-distribution
 */
const getPipelineDistribution = async (req, res, next) => {
  try {
    // Get pipeline distribution data
    let query = `
      SELECT stage as name, COUNT(*) as value
      FROM leads
      WHERE deleted_at IS NULL
    `;

    // Filter by user if not a super_admin
    if (req.user.role !== 'super_admin') {
      query += ' AND created_by = $1';
    }

    query += ' GROUP BY stage ORDER BY stage';

    const distributionResult = await db.query(
      query,
      req.user.role !== 'super_admin' ? [req.user.id] : []
    );

    // Send the response
    const { response, statusCode } = formatSuccess(distributionResult.rows);
    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Get recent activities
 * GET /api/dashboard/recent-activities
 */
const getRecentActivities = async (req, res, next) => {
  try {
    // Get recent activities
    let query = `
      SELECT 
        la.id,
        la.activity_type as type,
        CASE
          WHEN la.activity_type = 'created' THEN CONCAT('New Lead: ', l.deal_name)
          WHEN la.activity_type = 'stage_changed' THEN 'Lead Stage Changed'
          WHEN la.activity_type = 'amount_changed' THEN 'Lead Amount Changed'
          ELSE 'Lead Updated'
        END as title,
        la.description,
        la.created_at as timestamp,
        json_build_object('id', u.id, 'name', u.name) as "user"
      FROM 
        lead_activities la
      JOIN 
        leads l ON la.lead_id = l.id
      JOIN 
        users u ON la.user_id = u.id
      WHERE 
        l.deleted_at IS NULL
    `;

    // Filter by user if not a super_admin
    if (req.user.role !== 'super_admin') {
      query += ' AND (l.created_by = $1 OR la.user_id = $1)';
    }

    query += ' ORDER BY la.created_at DESC LIMIT 10';

    const activitiesResult = await db.query(
      query,
      req.user.role !== 'super_admin' ? [req.user.id] : []
    );

    // Send the response
    const { response, statusCode } = formatSuccess({
      activities: activitiesResult.rows
    });
    
    res.status(statusCode).json(response);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardStats,
  getPipelineDistribution,
  getRecentActivities
};