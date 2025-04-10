-- Create a simplified version of the database schema without JWT dependencies

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role_id INTEGER NOT NULL REFERENCES roles(id),
    avatar VARCHAR(255),
    phone VARCHAR(20),
    last_login TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Create notification_settings table
CREATE TABLE IF NOT EXISTS notification_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) UNIQUE,
    email_notifications BOOLEAN DEFAULT TRUE,
    lead_updates BOOLEAN DEFAULT TRUE,
    customer_activities BOOLEAN DEFAULT TRUE,
    marketing_updates BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

-- Create companies table
CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    industry VARCHAR(100),
    location VARCHAR(100),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    company_id INTEGER REFERENCES companies(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    deal_name VARCHAR(100) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    product VARCHAR(100) NOT NULL,
    stage VARCHAR(20) NOT NULL CHECK (stage IN ('new', 'contacted', 'analysis', 'proposal', 'negotiation', 'won', 'hold', 'progress', 'completed', 'lost')),
    date DATE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    attained_through VARCHAR(50),
    document_url VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Create lead_activities table to track lead changes
CREATE TABLE IF NOT EXISTS lead_activities (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    activity_type VARCHAR(50) NOT NULL,
    description TEXT,
    previous_value JSONB,
    new_value JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create permissions table for RBAC
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(resource, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER NOT NULL REFERENCES roles(id),
    permission_id INTEGER NOT NULL REFERENCES permissions(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);

-- Insert default roles if they don't exist
INSERT INTO roles (name, description)
SELECT 'super_admin', 'System administrator with full access to all features'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'super_admin');

INSERT INTO roles (name, description)
SELECT 'sales', 'Sales representative with access to manage leads and customers'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'sales');

INSERT INTO roles (name, description)
SELECT 'telecaller', 'Call center agent with limited access to update leads'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'telecaller');

-- Insert default permissions if they don't exist
INSERT INTO permissions (resource, action, description)
SELECT 'users', 'create', 'Create new users'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE resource = 'users' AND action = 'create');

INSERT INTO permissions (resource, action, description)
SELECT 'users', 'read', 'View user details'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE resource = 'users' AND action = 'read');

-- Add more permissions here...

-- Insert a default admin user if no users exist
INSERT INTO users (name, email, password_hash, role_id)
SELECT 
    'Admin User', 
    'admin@example.com', 
    '$2a$10$3QTJcpuRmqjyY5Y9cRLW7u2tF1n/6qZS2w5g4HErdZA9iJR0JGzOe', -- password: admin123
    (SELECT id FROM roles WHERE name = 'super_admin')
WHERE NOT EXISTS (SELECT 1 FROM users);