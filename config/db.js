const { Pool } = require('pg');
require('dotenv').config();

// Create a new PostgreSQL connection pool using environment variables
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Test the database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to the database:', err.stack);
  } else {
    console.log('Successfully connected to the database!');
    release();
  }
});

// Export the pool for use in other files
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};