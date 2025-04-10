# ManuFlow CRM API

A comprehensive Node.js API for the ManuFlow CRM application, providing endpoints for authentication, dashboard statistics, leads, customers, companies, users, and settings management.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Configuration](#configuration)
- [Running the API](#running-the-api)
- [API Documentation](#api-documentation)
  - [Authentication](#authentication)
  - [Dashboard](#dashboard)
  - [Leads](#leads)
  - [Customers](#customers)
  - [Companies](#companies)
  - [Users & Permissions](#users--permissions)
  - [Settings](#settings)
- [Role-Based Access Control](#role-based-access-control)
- [Error Handling](#error-handling)

## Features

- User authentication with JWT tokens
- Role-based access control (RBAC)
- Dashboard statistics and analytics
- Lead management
- Customer management
- Company management
- User management
- Settings management
- Activity tracking
- Comprehensive error handling

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn package manager

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/manuflow-crm-api.git
   cd manuflow-crm-api
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Database Setup

1. Create a PostgreSQL database:
   ```bash
   createdb manuflow_crm
   ```

2. Run the SQL script provided in the `SQL file` to create the database schema:
   ```bash
   psql manuflow_crm < sql_file.sql
   ```

## Configuration

1. Create a `.env` file in the root directory with the following variables:
   ```
   # Server Config
   PORT=3000
   NODE_ENV=development

   # Database Config
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=manuflow_crm
   DB_USER=postgres
   DB_PASSWORD=your_password

   # JWT Config
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRES_IN=24h

   # API Base URL
   API_BASE_URL=https://api.manuflow.com
   ```

2. Adjust the values according to your environment.

## Running the API

1. Start the server in development mode:
   ```bash
   npm run dev
   ```

2. Start the server in production mode:
   ```bash
   npm start
   ```

The API will be available at `http://localhost:3000/api` (or the port you specified in the `.env` file).

## API Documentation

### Authentication

- **POST /api/auth/login** - Authenticate a user
- **POST /api/auth/logout** - Logout a user
- **GET /api/auth/me** - Get current user details

### Dashboard

- **GET /api/dashboard/stats** - Get dashboard statistics
- **GET /api/dashboard/pipeline-distribution** - Get pipeline stage distribution
- **GET /api/dashboard/recent-activities** - Get recent activities

### Leads

- **GET /api/leads** - Get all leads
- **GET /api/leads/:id** - Get a specific lead
- **POST /api/leads** - Create a new lead
- **PUT /api/leads/:id** - Update a lead
- **DELETE /api/leads/:id** - Delete a lead

### Customers

- **GET /api/customers** - Get all customers
- **GET /api/customers/:id** - Get a specific customer
- **POST /api/customers** - Create a new customer
- **PUT /api/customers/:id** - Update a customer
- **DELETE /api/customers/:id** - Delete a customer

### Companies

- **GET /api/companies** - Get all companies
- **GET /api/companies/:id** - Get a specific company
- **POST /api/companies** - Create a new company
- **PUT /api/companies/:id** - Update a company
- **DELETE /api/companies/:id** - Delete a company
- **GET /api/companies/:id/customers** - Get all customers belonging to a company

### Users & Permissions

- **GET /api/users** - Get all users (admin only)
- **GET /api/users/:id** - Get a specific user
- **POST /api/users** - Create a new user (admin only)
- **PUT /api/users/:id** - Update a user
- **DELETE /api/users/:id** - Delete a user (admin only)
- **PUT /api/users/:id/role** - Update a user's role (admin only)
- **GET /api/roles/permissions** - Get all role permissions (admin only)
- **PUT /api/roles/:role/permissions** - Update role permissions (admin only)

### Settings

- **PUT /api/settings/profile** - Update user profile
- **PUT /api/settings/password** - Change password
- **GET /api/settings/notifications** - Get notification settings
- **PUT /api/settings/notifications** - Update notification settings
- **PUT /api/settings/security** - Update security settings

## Role-Based Access Control

The API implements role-based access control with three pre