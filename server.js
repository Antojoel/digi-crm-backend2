const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const leadsRoutes = require('./routes/leadsRoutes');
const customersRoutes = require('./routes/customersRoutes');
const companiesRoutes = require('./routes/companiesRoutes');
const usersRoutes = require('./routes/usersRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

// Import error handler
const { errorHandler } = require('./utils/errorHandler');

// Create Express app
const app = express();

// Set port
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'], // Add your frontend URLs
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Base URL
const API_BASE = '/api';

// Routes
app.use(`${API_BASE}/auth`, authRoutes);
app.use(`${API_BASE}/dashboard`, dashboardRoutes);
app.use(`${API_BASE}/leads`, leadsRoutes);
app.use(`${API_BASE}/customers`, customersRoutes);
app.use(`${API_BASE}/companies`, companiesRoutes);
app.use(`${API_BASE}/users`, usersRoutes);
app.use(`${API_BASE}/settings`, settingsRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'ManuFlow CRM API is running',
    version: '1.0.0'
  });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Global error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API Base URL: ${'http://localhost:' + PORT + API_BASE}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
});

module.exports = app;