const { Pool } = require('pg');
require('dotenv').config();

// Create a new PostgreSQL connection pool using the connection string
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_3MtK5PfyYlwh@ep-spring-bar-a1c8x0hb-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
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