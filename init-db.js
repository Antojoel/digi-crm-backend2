const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Create a new PostgreSQL connection pool using the connection string
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_3MtK5PfyYlwh@ep-spring-bar-a1c8x0hb-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
});

async function initDatabase() {
  try {
    // Read the SQL initialization file
    const sqlFilePath = path.join(__dirname, 'db-init.sql');
    const sqlScript = fs.readFileSync(sqlFilePath, 'utf8');

    // Connect to the database
    const client = await pool.connect();
    
    try {
      // Execute the SQL script
      await client.query(sqlScript);
      console.log('Database initialized successfully!');
    } finally {
      // Release the client back to the pool
      client.release();
    }
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    // End the pool
    await pool.end();
  }
}

// Run the initialization
initDatabase();