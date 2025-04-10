const express = require('express');
const { getDashboardStats, getPipelineDistribution, getRecentActivities } = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

const router = express.Router();

// All dashboard routes require authentication
router.use(authenticate);

// Get dashboard statistics
router.get('/stats', getDashboardStats);

// Get pipeline stage distribution
router.get('/pipeline-distribution', getPipelineDistribution);

// Get recent activities
router.get('/recent-activities', getRecentActivities);

module.exports = router;