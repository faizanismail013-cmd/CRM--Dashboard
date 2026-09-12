// @ts-nocheck
/**
 * SmartPay CRM — Neon Database Connection (Enhanced)
 * Handles PostgreSQL connection via Neon serverless driver
 * and provides user management, CRM, notifications, and audit queries.
 */

const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

let sql;

// ─── Placeholder Detection ─────────────────────────────────────────
function isPlaceholderUrl(url) {
  if (!url) return true;
  const placeholders = ['user:password', 'ep-xxxxx', 'your_', 'changeme', 'dbname?'];
  return placeholders.some(p => url.includes(p));
}

/**
 * Initialize the database connection and create tables if needed.
 */
async function initDB() {
  const dbUrl = process.env.DATABASE_URL;

  if (isPlaceholderUrl(dbUrl)) {
    console.log('⚠️  DATABASE_URL is a placeholder — running in offline mode (no DB persistence)');
    sql = null;
    return false;
  }

  try {
    sql = neon(dbUrl);

    // Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        google_id VARCHAR(255) UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        username VARCHAR(100) UNIQUE,
        password_hash VARCHAR(255),
        is_verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(255),
        verification_token_expires TIMESTAMP,
        reset_token VARCHAR(255),
        reset_token_expires TIMESTAMP,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP,
        avatar VARCHAR(512),
        provider VARCHAR(50) DEFAULT 'google',
        role VARCHAR(50) DEFAULT 'rep',
        phone VARCHAR(50),
        department VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP DEFAULT NOW()
      )
    `;

    // Ensure columns exist if table was already created earlier
    const alterCols = [
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'rep'`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS team_name VARCHAR(100)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) DEFAULT 5.0`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS base_salary INTEGER DEFAULT 0`
    ];
    for (const stmt of alterCols) {
      try { await sql([stmt]); } catch (e) { /* ignore */ }
    }

    // Auto-verify Google users
    try {
      await sql`UPDATE users SET is_verified = TRUE WHERE provider = 'google' AND is_verified IS NOT TRUE`;
    } catch (e) { /* ignore */ }

    // Create login_history table
    await sql`
      CREATE TABLE IF NOT EXISTS login_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        login_at TIMESTAMP DEFAULT NOW(),
        ip_address VARCHAR(50),
        user_agent TEXT
      )
    `;

    // ─── CRM Tables (with user_id ownership) ────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL, initial VARCHAR(10), logo VARCHAR(50), industry VARCHAR(100),
      owner VARCHAR(100), status VARCHAR(50), activity VARCHAR(100), created BIGINT,
      tags JSONB DEFAULT '[]'::jsonb, source VARCHAR(100),
      customer_id VARCHAR(50), public_token VARCHAR(64), gst_number VARCHAR(50), pan_number VARCHAR(50),
      website VARCHAR(255), phone VARCHAR(50), alternate_phone VARCHAR(50), alternate_email VARCHAR(255),
      billing_address TEXT, shipping_address TEXT, city VARCHAR(100), state VARCHAR(100), country VARCHAR(100), pin_code VARCHAR(20),
      customer_status VARCHAR(50) DEFAULT 'Active Customer', customer_type VARCHAR(50) DEFAULT 'Enterprise',
      created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    )`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS customer_id VARCHAR(50)`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS public_token VARCHAR(64)`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS gst_number VARCHAR(50)`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pan_number VARCHAR(50)`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS website VARCHAR(255)`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS alternate_phone VARCHAR(50)`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS alternate_email VARCHAR(255)`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS billing_address TEXT`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS shipping_address TEXT`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS city VARCHAR(100)`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS state VARCHAR(100)`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS country VARCHAR(100)`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pin_code VARCHAR(20)`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS customer_status VARCHAR(50) DEFAULT 'Active Customer'`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS customer_type VARCHAR(50) DEFAULT 'Enterprise'`;

    await sql`CREATE TABLE IF NOT EXISTS deals (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(255) NOT NULL, company VARCHAR(255), value INTEGER, stage VARCHAR(100),
      probability INTEGER, owner VARCHAR(100), due VARCHAR(50), month VARCHAR(50), tag VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(255) NOT NULL, company VARCHAR(255), due VARCHAR(100),
      bucket VARCHAR(50), priority VARCHAR(50), done BOOLEAN DEFAULT false, assignee VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL, initials VARCHAR(10), title VARCHAR(100),
      email VARCHAR(255), phone VARCHAR(50), primary_contact BOOLEAN DEFAULT false,
      contact_role VARCHAR(50) DEFAULT 'Primary Contact', department VARCHAR(100), is_archived BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    )`;
    await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS contact_role VARCHAR(50) DEFAULT 'Primary Contact'`;
    await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS department VARCHAR(100)`;
    await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false`;

    await sql`CREATE TABLE IF NOT EXISTS activities (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type VARCHAR(50), icon VARCHAR(10), text TEXT, time VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS letters (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type VARCHAR(50), "employeeName" VARCHAR(255), "recipientEmail" VARCHAR(255),
      subject VARCHAR(255), "createdAt" VARCHAR(100), status VARCHAR(50),
      error_message TEXT, letter_data JSONB, sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS stages (
      name VARCHAR(100) PRIMARY KEY, probability INTEGER, color VARCHAR(50)
    )`;

    // ─── Notifications Table ─────────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT,
      data JSONB DEFAULT '{}'::jsonb,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // ─── Audit Logs Table ────────────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(50) NOT NULL,
      resource VARCHAR(50),
      resource_id INTEGER,
      changes JSONB DEFAULT '{}'::jsonb,
      ip_address VARCHAR(50),
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // ─── Products / Services Catalog ────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      sku VARCHAR(100),
      description TEXT,
      cost_price INTEGER DEFAULT 0,
      unit_price INTEGER DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'INR',
      category VARCHAR(100),
      vendor VARCHAR(100),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price INTEGER DEFAULT 0`;
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor VARCHAR(100)`;

    // ─── Quotations ─────────────────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS quotations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      quotation_number VARCHAR(50),
      public_token VARCHAR(64),
      version INTEGER DEFAULT 1,
      deal_id INTEGER,
      company_id INTEGER,
      contact_id INTEGER,
      status VARCHAR(50) DEFAULT 'draft',
      valid_until DATE,
      subtotal INTEGER DEFAULT 0,
      discount_percent NUMERIC(5,2) DEFAULT 0,
      tax_percent NUMERIC(5,2) DEFAULT 18,
      total INTEGER DEFAULT 0,
      notes TEXT,
      terms TEXT,
      rejection_reason TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;
    await sql`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS public_token VARCHAR(64)`;
    await sql`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1`;
    await sql`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS rejection_reason TEXT`;

    // ─── Quotation Versions History ─────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS quotation_versions (
      id SERIAL PRIMARY KEY,
      quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      subtotal INTEGER DEFAULT 0,
      discount_amount INTEGER DEFAULT 0,
      tax_amount INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      items_json JSONB,
      created_by VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // ─── Quotation Line Items ───────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS quotation_items (
      id SERIAL PRIMARY KEY,
      quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
      product_id INTEGER,
      description TEXT,
      quantity INTEGER DEFAULT 1,
      unit_price INTEGER DEFAULT 0,
      discount_percent NUMERIC(5,2) DEFAULT 0,
      total INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    )`;

    // ─── Purchase Orders ────────────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS purchase_orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      po_number VARCHAR(100) UNIQUE,
      deal_id INTEGER,
      company_id INTEGER,
      quotation_id INTEGER,
      amount INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'received',
      issue_date DATE,
      delivery_date DATE,
      notes TEXT,
      rejection_reason TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;
    await sql`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT`;

    // ─── Invoices ───────────────────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      invoice_number VARCHAR(100) UNIQUE,
      po_id INTEGER,
      quotation_id INTEGER,
      deal_id INTEGER,
      company_id INTEGER,
      contact_id INTEGER,
      status VARCHAR(50) DEFAULT 'draft',
      issue_date DATE DEFAULT CURRENT_DATE,
      due_date DATE,
      subtotal INTEGER DEFAULT 0,
      discount_percent NUMERIC(5,2) DEFAULT 0,
      tax_percent NUMERIC(5,2) DEFAULT 18,
      total INTEGER DEFAULT 0,
      amount_paid INTEGER DEFAULT 0,
      notes TEXT,
      terms TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    // ─── Invoice Line Items ─────────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS invoice_items (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
      product_id INTEGER,
      description TEXT,
      quantity INTEGER DEFAULT 1,
      unit_price INTEGER DEFAULT 0,
      discount_percent NUMERIC(5,2) DEFAULT 0,
      total INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    )`;

    // ─── Payments ───────────────────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      payment_number VARCHAR(100) UNIQUE,
      invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
      company_id INTEGER,
      amount INTEGER NOT NULL,
      payment_date DATE DEFAULT CURRENT_DATE,
      payment_method VARCHAR(50) DEFAULT 'bank_transfer',
      reference_number VARCHAR(100),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // ─── Teams (Sales Hierarchy) ────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    // ─── Commission Rules (Slabs) ────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS commission_rules (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      min_attainment_pct NUMERIC(5,2) DEFAULT 0,
      max_attainment_pct NUMERIC(5,2) DEFAULT 100,
      commission_pct NUMERIC(5,2) DEFAULT 5.0,
      bonus_amount INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // ─── Commissions Ledger ──────────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS commissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      deal_id INTEGER,
      invoice_id INTEGER,
      deal_amount INTEGER DEFAULT 0,
      commission_rate NUMERIC(5,2) DEFAULT 5.0,
      commission_amount INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'earned',
      earned_date DATE DEFAULT CURRENT_DATE,
      paid_date DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // ─── Sales Targets & Quotas ─────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS sales_targets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      period_type VARCHAR(50) DEFAULT 'monthly',
      period_name VARCHAR(50) NOT NULL,
      target_amount INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // ─── Leads Management ──────────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      company VARCHAR(255),
      contact_name VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(50),
      source VARCHAR(100) DEFAULT 'Inbound',
      industry VARCHAR(100) DEFAULT 'General',
      owner VARCHAR(100) DEFAULT 'Aarav Sharma',
      lead_score INTEGER DEFAULT 50,
      status VARCHAR(50) DEFAULT 'New',
      expected_value INTEGER DEFAULT 0,
      next_followup DATE,
      notes TEXT,
      converted_company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      converted_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      converted_deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    // ─── Renewals Management ────────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS renewals (
      id SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      contract_start DATE,
      contract_end DATE,
      renewal_date DATE NOT NULL,
      value INTEGER DEFAULT 0,
      owner VARCHAR(100) DEFAULT 'Aarav Sharma',
      status VARCHAR(50) DEFAULT 'Upcoming',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    // ─── Communication Hub ─────────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS communications (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50) DEFAULT 'email',
      recipient VARCHAR(255),
      cc VARCHAR(255),
      bcc VARCHAR(255),
      subject VARCHAR(255),
      body_html TEXT,
      status VARCHAR(50) DEFAULT 'sent',
      entity_type VARCHAR(50),
      entity_id INTEGER,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // ─── Email Templates ───────────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS email_templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      subject VARCHAR(255) NOT NULL,
      category VARCHAR(50) DEFAULT 'general',
      body_html TEXT NOT NULL,
      variables TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // ─── Automation Engine ─────────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS automations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      event VARCHAR(100) NOT NULL,
      condition_json TEXT,
      action_json TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS automation_logs (
      id SERIAL PRIMARY KEY,
      automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,
      event VARCHAR(100),
      status VARCHAR(50) DEFAULT 'success',
      payload_json TEXT,
      error_message TEXT,
      executed_at TIMESTAMP DEFAULT NOW()
    )`;

    // ─── Documents Repository ──────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) DEFAULT 'other',
      entity_type VARCHAR(50),
      entity_id INTEGER,
      file_path TEXT,
      file_size INTEGER DEFAULT 0,
      version INTEGER DEFAULT 1,
      uploaded_by VARCHAR(100) DEFAULT 'Aarav Sharma',
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // ─── Approval Workflows ────────────────────────────────────────
    await sql`CREATE TABLE IF NOT EXISTS approvals (
      id SERIAL PRIMARY KEY,
      type VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50),
      entity_id INTEGER,
      requester_name VARCHAR(100) DEFAULT 'Aarav Sharma',
      approver_name VARCHAR(100) DEFAULT 'Manager',
      status VARCHAR(50) DEFAULT 'Pending',
      old_value TEXT,
      new_value TEXT,
      comments TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    // Add new columns to existing CRM tables if they were created before this enhancement
    const crmAlterCols = [
      'ALTER TABLE companies ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL',
      'ALTER TABLE companies ADD COLUMN IF NOT EXISTS source VARCHAR(100)',
      'ALTER TABLE companies ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()',
      'ALTER TABLE companies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()',
      'ALTER TABLE companies ADD COLUMN IF NOT EXISTS website VARCHAR(255)',
      'ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone VARCHAR(50)',
      'ALTER TABLE companies ADD COLUMN IF NOT EXISTS address TEXT',
      'ALTER TABLE companies ADD COLUMN IF NOT EXISTS city VARCHAR(100)',
      'ALTER TABLE companies ADD COLUMN IF NOT EXISTS employee_count VARCHAR(50)',
      'ALTER TABLE deals ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL',
      'ALTER TABLE deals ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()',
      'ALTER TABLE deals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()',
      'ALTER TABLE deals ADD COLUMN IF NOT EXISTS contact_id INTEGER',
      'ALTER TABLE deals ADD COLUMN IF NOT EXISTS lost_reason VARCHAR(255)',
      'ALTER TABLE deals ADD COLUMN IF NOT EXISTS lost_notes TEXT',
      'ALTER TABLE deals ADD COLUMN IF NOT EXISTS won_date TIMESTAMP',
      'ALTER TABLE deals ADD COLUMN IF NOT EXISTS lost_date TIMESTAMP',
      'ALTER TABLE deals ADD COLUMN IF NOT EXISTS expected_close_date DATE',
      'ALTER TABLE deals ADD COLUMN IF NOT EXISTS deal_type VARCHAR(50) DEFAULT \'new_business\'',
      'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL',
      'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()',
      'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()',
      'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL',
      'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()',
      'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()',
      'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_id INTEGER',
      'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_name VARCHAR(255)',
      'ALTER TABLE activities ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL',
      'ALTER TABLE activities ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()',
      'ALTER TABLE letters ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL',
      'ALTER TABLE letters ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()',
      'ALTER TABLE letters ADD COLUMN IF NOT EXISTS error_message TEXT',
      'ALTER TABLE letters ADD COLUMN IF NOT EXISTS letter_data JSONB',
      'ALTER TABLE letters ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP'
    ];
    for (const stmt of crmAlterCols) {
      try { await sql([stmt]); } catch (e) { /* ignore */ }
    }

    // Create indexes for performance
    const indexes = [
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL',
      'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource, resource_id)',
      'CREATE INDEX IF NOT EXISTS idx_companies_user ON companies(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_deals_user ON deals(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_bucket ON tasks(bucket)',
      'CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id, login_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)',
      'CREATE INDEX IF NOT EXISTS idx_quotations_user ON quotations(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_quotations_deal ON quotations(deal_id)',
      'CREATE INDEX IF NOT EXISTS idx_quotations_company ON quotations(company_id)',
      'CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON quotation_items(quotation_id)',
      'CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id)',
      'CREATE INDEX IF NOT EXISTS idx_deals_contact ON deals(contact_id)'
    ];
    for (const stmt of indexes) {
      try { await sql([stmt]); } catch (e) { /* ignore */ }
    }

    // Seed initial stages if empty
    const stagesCount = await sql`SELECT COUNT(*) as count FROM stages`;
    if (Number(stagesCount[0].count) === 0) {
      await sql`INSERT INTO stages (name, probability, color) VALUES 
        ('New Lead', 10, '#8fa1bb'), ('Qualified', 25, '#38a9b8'),
        ('Proposal Sent', 50, '#4c84d9'), ('Negotiation', 75, '#315fba'), ('Won', 100, '#29a56b')`;
    }

    console.log('✅ Database connected and all CRM tables ready');
    return true;
  } catch (error) {
    sql = null;
    console.error('⚠️  Database connection failed:', error.message);
    console.log('   Running in offline mode (no database persistence)');
    return false;
  }
}

function getDb() {
  return sql;
}

// ─── In-memory user, audit & notification fallback stores ───────────
const localUsers = new Map();
const localAuditLogs = [];
const localNotifications = [];

const LOCAL_USERS_FILE = path.join(__dirname, '.local_users.json');

function loadLocalUsersFromDisk() {
  try {
    if (fs.existsSync(LOCAL_USERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(LOCAL_USERS_FILE, 'utf8'));
      if (Array.isArray(data)) {
        for (const u of data) {
          if (u && (u.id !== undefined && u.id !== null)) {
            localUsers.set(Number(u.id), u);
            localUsers.set(String(u.id), u);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Could not load local users from disk:', err.message);
  }
}

function saveLocalUsersToDisk() {
  try {
    const mapUnique = new Map();
    for (const u of localUsers.values()) {
      if (u && u.id !== undefined) mapUnique.set(String(u.id), u);
    }
    const list = Array.from(mapUnique.values());
    fs.writeFileSync(LOCAL_USERS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not save local users to disk:', err.message);
  }
}

// Load persisted users on boot
loadLocalUsersFromDisk();

/**
 * Find a user by their Google ID.
 */
async function findUserByGoogleId(googleId) {
  if (!sql) {
    for (const user of localUsers.values()) {
      if (user.google_id === googleId) return user;
    }
    loadLocalUsersFromDisk();
    for (const user of localUsers.values()) {
      if (user.google_id === googleId) return user;
    }
    return null;
  }
  try {
    const rows = await sql`SELECT * FROM users WHERE google_id = ${googleId}`;
    return rows[0] || null;
  } catch (error) {
    console.error('DB Error (findUserByGoogleId):', error.message);
    return null;
  }
}

/**
 * Find a user by their ID.
 */
async function findUserById(id) {
  if (!id) return null;
  if (sql) {
    try {
      const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
      if (rows[0]) return rows[0];
    } catch (error) {
      console.error('DB Error (findUserById):', error.message);
    }
  }
  // Check local fallback
  if (localUsers.has(Number(id))) return localUsers.get(Number(id));
  if (localUsers.has(String(id))) return localUsers.get(String(id));
  for (const user of localUsers.values()) {
    if (String(user.id) === String(id)) return user;
  }
  loadLocalUsersFromDisk();
  if (localUsers.has(Number(id))) return localUsers.get(Number(id));
  if (localUsers.has(String(id))) return localUsers.get(String(id));
  for (const user of localUsers.values()) {
    if (String(user.id) === String(id)) return user;
  }
  return null;
}

/**
 * Create or update a user from Google OAuth profile.
 */
async function upsertGoogleUser(profile) {
  const email = (profile.emails?.[0]?.value || 'user@example.com').toLowerCase().trim();
  const name = profile.displayName || 'User';
  const avatar = profile.photos?.[0]?.value || null;
  const googleId = profile.id;

  if (!sql) {
    let user = null;
    for (const u of localUsers.values()) {
      if (u.google_id === googleId || (u.email && u.email.toLowerCase() === email)) {
        user = u;
        break;
      }
    }

    if (user) {
      user.google_id = googleId;
      user.last_login = new Date();
      if (avatar) user.avatar = avatar;
      user.is_verified = true;
      saveLocalUsersToDisk();
      return user;
    }

    const id = Date.now();
    const role = localUsers.size === 0 ? 'admin' : 'rep';
    const username = email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase();
    user = {
      id,
      google_id: googleId,
      email,
      name,
      username,
      password_hash: null,
      avatar,
      provider: 'google',
      role,
      is_verified: true,
      created_at: new Date(),
      last_login: new Date(),
      failed_login_attempts: 0,
      locked_until: null,
      is_active: true
    };
    localUsers.set(id, user);
    localUsers.set(String(id), user);
    saveLocalUsersToDisk();
    return user;
  }

  try {
    const existing = await findUserByGoogleId(googleId) || await findUserByIdentifier(email);
    if (existing) {
      await sql`
        UPDATE users 
        SET last_login = NOW(), 
            avatar = COALESCE(${avatar}, avatar), 
            google_id = COALESCE(google_id, ${googleId}), 
            is_verified = TRUE 
        WHERE id = ${existing.id}
      `;
      return { ...existing, google_id: googleId, is_verified: true, avatar: avatar || existing.avatar };
    }

    // First user gets admin role
    const userCount = await sql`SELECT COUNT(*) as count FROM users`;
    const role = Number(userCount[0].count) === 0 ? 'admin' : 'rep';
    const username = email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase();

    const rows = await sql`
      INSERT INTO users (google_id, email, name, username, avatar, provider, is_verified, role)
      VALUES (${googleId}, ${email}, ${name}, ${username}, ${avatar}, 'google', TRUE, ${role})
      RETURNING *
    `;
    return rows[0];
  } catch (error) {
    console.error('DB Error (upsertGoogleUser):', error.message);
    const id = Date.now();
    const user = {
      id,
      google_id: googleId,
      email,
      name,
      username: email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase(),
      avatar,
      provider: 'google',
      role: 'rep',
      is_verified: true,
      created_at: new Date()
    };
    localUsers.set(id, user);
    localUsers.set(String(id), user);
    saveLocalUsersToDisk();
    return user;
  }
}

/**
 * Record a login event.
 */
async function recordLogin(userId, ip, userAgent) {
  if (!sql) return;
  try {
    await sql`INSERT INTO login_history (user_id, ip_address, user_agent) VALUES (${userId}, ${ip}, ${userAgent})`;
  } catch (error) {
    console.error('DB Error (recordLogin):', error.message);
  }
}

/**
 * Find user by email or username (case-insensitive)
 */
async function findUserByIdentifier(identifier) {
  if (!identifier) return null;
  const clean = String(identifier).trim().toLowerCase();

  if (sql) {
    try {
      const rows = await sql`
        SELECT * FROM users 
        WHERE LOWER(email) = ${clean} OR LOWER(username) = ${clean}
        LIMIT 1
      `;
      if (rows[0]) return rows[0];
    } catch (err) {
      console.warn('DB findUserByIdentifier fallback:', err.message);
    }
  }

  for (const user of localUsers.values()) {
    if (user.email?.toLowerCase() === clean || user.username?.toLowerCase() === clean) {
      return user;
    }
  }

  // Reload from disk if not found in memory
  loadLocalUsersFromDisk();
  for (const user of localUsers.values()) {
    if (user.email?.toLowerCase() === clean || user.username?.toLowerCase() === clean) {
      return user;
    }
  }
  return null;
}

/**
 * Find user by email
 */
async function findUserByEmail(email) {
  return findUserByIdentifier(email);
}

/**
 * Find user by token
 */
async function findUserByVerificationToken(token) {
  if (!token) return null;
  if (sql) {
    try {
      const rows = await sql`
        SELECT * FROM users
        WHERE verification_token = ${token}
        LIMIT 1
      `;
      if (rows[0]) return rows[0];
    } catch (err) {
      console.warn('DB findUserByVerificationToken fallback:', err.message);
    }
  }
  for (const user of localUsers.values()) {
    if (user.verification_token === token) return user;
  }
  return null;
}

/**
 * Find user by reset token
 */
async function findUserByResetToken(token) {
  if (!token) return null;
  if (sql) {
    try {
      const rows = await sql`
        SELECT * FROM users
        WHERE reset_token = ${token}
        LIMIT 1
      `;
      if (rows[0]) return rows[0];
    } catch (err) {
      console.warn('DB findUserByResetToken fallback:', err.message);
    }
  }
  for (const user of localUsers.values()) {
    if (user.reset_token === token) return user;
  }
  return null;
}

/**
 * Create a new registered user with hashed password and verification token
 */
async function createPasswordUser({ name, username, email, password_hash, verification_token, verification_token_expires, is_verified = false }) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanUsername = username.trim().toLowerCase();

  if (sql) {
    try {
      // First user gets admin role
      const userCount = await sql`SELECT COUNT(*) as count FROM users`;
      const role = Number(userCount[0].count) === 0 ? 'admin' : 'rep';

      const rows = await sql`
        INSERT INTO users (
          name, username, email, password_hash, is_verified, 
          verification_token, verification_token_expires, provider, role
        ) VALUES (
          ${name}, ${cleanUsername}, ${cleanEmail}, ${password_hash}, ${is_verified === true},
          ${verification_token}, ${verification_token_expires}, 'local', ${role}
        )
        RETURNING *
      `;
      return rows[0];
    } catch (err) {
      console.error('DB createPasswordUser error:', err.message);
      if (err.message.includes('unique') || err.message.includes('duplicate')) {
        throw new Error('An account with this email or username already exists.');
      }
    }
  }

  // Fallback to in-memory store
  const id = Date.now();
  const role = localUsers.size === 0 ? 'admin' : 'rep';
  const user = {
    id,
    name,
    username: cleanUsername,
    email: cleanEmail,
    password_hash,
    is_verified: is_verified === true,
    verification_token,
    verification_token_expires,
    provider: 'local',
    role,
    created_at: new Date(),
    failed_login_attempts: 0,
    locked_until: null,
    is_active: true
  };
  localUsers.set(id, user);
  localUsers.set(String(id), user);
  saveLocalUsersToDisk();
  return user;
}

/**
 * Verify user email
 */
async function verifyUser(id) {
  if (sql) {
    try {
      const rows = await sql`
        UPDATE users
        SET is_verified = TRUE, verification_token = NULL, verification_token_expires = NULL
        WHERE id = ${id}
        RETURNING *
      `;
      if (rows[0]) return rows[0];
    } catch (err) {
      console.warn('DB verifyUser fallback:', err.message);
    }
  }

  let user = localUsers.get(Number(id)) || localUsers.get(String(id)) || localUsers.get(id);
  if (!user) {
    for (const u of localUsers.values()) {
      if (String(u.id) === String(id)) { user = u; break; }
    }
  }
  if (user) {
    user.is_verified = true;
    user.verification_token = null;
    user.verification_token_expires = null;
    saveLocalUsersToDisk();
    return user;
  }
  return null;
}

/**
 * Update verification token for resending
 */
async function updateVerificationToken(id, token, expires) {
  if (sql) {
    try {
      await sql`
        UPDATE users
        SET verification_token = ${token}, verification_token_expires = ${expires}
        WHERE id = ${id}
      `;
      return true;
    } catch (err) {
      console.warn('DB updateVerificationToken fallback:', err.message);
    }
  }

  let user = localUsers.get(Number(id)) || localUsers.get(String(id)) || localUsers.get(id);
  if (!user) {
    for (const u of localUsers.values()) {
      if (String(u.id) === String(id)) { user = u; break; }
    }
  }
  if (user) {
    user.verification_token = token;
    user.verification_token_expires = expires;
    saveLocalUsersToDisk();
    return true;
  }
  return false;
}

/**
 * Set password reset token
 */
async function setPasswordResetToken(id, token, expires) {
  if (sql) {
    try {
      await sql`
        UPDATE users
        SET reset_token = ${token}, reset_token_expires = ${expires}
        WHERE id = ${id}
      `;
      return true;
    } catch (err) {
      console.warn('DB setPasswordResetToken fallback:', err.message);
    }
  }

  let user = localUsers.get(Number(id)) || localUsers.get(String(id)) || localUsers.get(id);
  if (!user) {
    for (const u of localUsers.values()) {
      if (String(u.id) === String(id)) { user = u; break; }
    }
  }
  if (user) {
    user.reset_token = token;
    user.reset_token_expires = expires;
    saveLocalUsersToDisk();
    return true;
  }
  return false;
}

/**
 * Reset user password and invalidate token
 */
async function resetUserPassword(id, password_hash) {
  if (sql) {
    try {
      await sql`
        UPDATE users
        SET password_hash = ${password_hash}, reset_token = NULL, reset_token_expires = NULL,
            failed_login_attempts = 0, locked_until = NULL, is_verified = TRUE
        WHERE id = ${id}
      `;
      return true;
    } catch (err) {
      console.warn('DB resetUserPassword fallback:', err.message);
    }
  }

  let user = localUsers.get(Number(id)) || localUsers.get(String(id)) || localUsers.get(id);
  if (!user) {
    for (const u of localUsers.values()) {
      if (String(u.id) === String(id)) { user = u; break; }
    }
  }
  if (user) {
    user.password_hash = password_hash;
    user.reset_token = null;
    user.reset_token_expires = null;
    user.failed_login_attempts = 0;
    user.locked_until = null;
    user.is_verified = true;
    saveLocalUsersToDisk();
    return true;
  }
  return false;
}

/**
 * Set or update a user's password (e.g. linking password to a Google account)
 */
async function updateUserPassword(id, password_hash) {
  if (sql) {
    try {
      await sql`
        UPDATE users
        SET password_hash = ${password_hash}, is_verified = TRUE,
            failed_login_attempts = 0, locked_until = NULL
        WHERE id = ${id}
      `;
      return true;
    } catch (err) {
      console.warn('DB updateUserPassword fallback:', err.message);
    }
  }

  let user = localUsers.get(Number(id)) || localUsers.get(String(id)) || localUsers.get(id);
  if (!user) {
    for (const u of localUsers.values()) {
      if (String(u.id) === String(id)) { user = u; break; }
    }
  }
  if (user) {
    user.password_hash = password_hash;
    user.is_verified = true;
    user.failed_login_attempts = 0;
    user.locked_until = null;
    saveLocalUsersToDisk();
    return true;
  }
  return false;
}

/**
 * Increment failed login attempts & lock account if threshold exceeded
 */
async function recordFailedAttempt(id) {
  if (sql) {
    try {
      const rows = await sql`
        UPDATE users
        SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
            locked_until = CASE 
              WHEN COALESCE(failed_login_attempts, 0) + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
              ELSE locked_until 
            END
        WHERE id = ${id}
        RETURNING failed_login_attempts, locked_until
      `;
      return rows[0];
    } catch (err) {
      console.warn('DB recordFailedAttempt fallback:', err.message);
    }
  }

  let user = localUsers.get(Number(id)) || localUsers.get(String(id)) || localUsers.get(id);
  if (!user) {
    for (const u of localUsers.values()) {
      if (String(u.id) === String(id)) { user = u; break; }
    }
  }
  if (user) {
    user.failed_login_attempts = (user.failed_login_attempts || 0) + 1;
    if (user.failed_login_attempts >= 5) {
      user.locked_until = new Date(Date.now() + 15 * 60 * 1000);
    }
    saveLocalUsersToDisk();
    return { failed_login_attempts: user.failed_login_attempts, locked_until: user.locked_until };
  }
  return null;
}

/**
 * Reset failed attempts upon successful login
 */
async function resetFailedAttempts(id) {
  if (sql) {
    try {
      await sql`
        UPDATE users
        SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW()
        WHERE id = ${id}
      `;
      return true;
    } catch (err) {
      console.warn('DB resetFailedAttempts fallback:', err.message);
    }
  }

  let user = localUsers.get(Number(id)) || localUsers.get(String(id)) || localUsers.get(id);
  if (!user) {
    for (const u of localUsers.values()) {
      if (String(u.id) === String(id)) { user = u; break; }
    }
  }
  if (user) {
    user.failed_login_attempts = 0;
    user.locked_until = null;
    user.last_login = new Date();
    saveLocalUsersToDisk();
    return true;
  }
  return false;
}

/**
 * Update user profile details (name, phone, department, avatar, username)
 */
async function updateUserProfile(id, { name, username, phone, department, avatar }) {
  if (sql) {
    try {
      const rows = await sql`
        UPDATE users
        SET 
          name = COALESCE(${name}, name),
          username = COALESCE(${username}, username),
          phone = COALESCE(${phone}, phone),
          department = COALESCE(${department}, department),
          avatar = COALESCE(${avatar}, avatar)
        WHERE id = ${id}
        RETURNING *
      `;
      if (rows[0]) return rows[0];
    } catch (err) {
      console.warn('DB updateUserProfile fallback:', err.message);
    }
  }

  let user = localUsers.get(Number(id)) || localUsers.get(String(id)) || localUsers.get(id);
  if (!user) {
    for (const u of localUsers.values()) {
      if (String(u.id) === String(id)) { user = u; break; }
    }
  }
  if (user) {
    if (name !== undefined) user.name = name;
    if (username !== undefined) user.username = username;
    if (phone !== undefined) user.phone = phone;
    if (department !== undefined) user.department = department;
    if (avatar !== undefined) user.avatar = avatar;
    saveLocalUsersToDisk();
    return user;
  }
  return null;
}

// ─── Notification Queries ───────────────────────────────────────────

async function createNotification(userId, type, title, message, data = {}) {
  if (sql) {
    try {
      const dataJson = JSON.stringify(data);
      const rows = await sql`
        INSERT INTO notifications (user_id, type, title, message, data)
        VALUES (${userId}, ${type}, ${title}, ${message}, ${dataJson}::jsonb)
        RETURNING *
      `;
      return rows[0];
    } catch (err) {
      console.warn('DB createNotification error:', err.message);
    }
  }
  // In-memory fallback
  const notif = { id: Date.now(), user_id: userId, type, title, message, data, is_read: false, created_at: new Date().toISOString() };
  localNotifications.unshift(notif);
  return notif;
}

async function getNotifications(userId, { page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  if (sql) {
    try {
      const rows = await sql`
        SELECT * FROM notifications
        WHERE user_id = ${userId}
        ORDER BY is_read ASC, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const countResult = await sql`SELECT COUNT(*) as count FROM notifications WHERE user_id = ${userId}`;
      return { data: rows, total: Number(countResult[0].count) };
    } catch (err) {
      console.warn('DB getNotifications error:', err.message);
    }
  }
  const all = localNotifications.filter(n => n.user_id === userId);
  return { data: all.slice(offset, offset + limit), total: all.length };
}

async function getUnreadCount(userId) {
  if (sql) {
    try {
      const rows = await sql`SELECT COUNT(*) as count FROM notifications WHERE user_id = ${userId} AND is_read = FALSE`;
      return Number(rows[0].count);
    } catch (err) {
      console.warn('DB getUnreadCount error:', err.message);
    }
  }
  return localNotifications.filter(n => n.user_id === userId && !n.is_read).length;
}

async function markNotificationRead(id, userId) {
  if (sql) {
    try {
      const rows = await sql`UPDATE notifications SET is_read = TRUE WHERE id = ${id} AND user_id = ${userId} RETURNING *`;
      return rows[0] || null;
    } catch (err) { console.warn('DB markNotificationRead error:', err.message); }
  }
  const notif = localNotifications.find(n => n.id === Number(id) && n.user_id === userId);
  if (notif) notif.is_read = true;
  return notif || null;
}

async function markAllNotificationsRead(userId) {
  if (sql) {
    try {
      await sql`UPDATE notifications SET is_read = TRUE WHERE user_id = ${userId} AND is_read = FALSE`;
      return true;
    } catch (err) { console.warn('DB markAllNotificationsRead error:', err.message); }
  }
  localNotifications.filter(n => n.user_id === userId).forEach(n => n.is_read = true);
  return true;
}

async function deleteNotification(id, userId) {
  if (sql) {
    try {
      const rows = await sql`DELETE FROM notifications WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
      return rows.length > 0;
    } catch (err) { console.warn('DB deleteNotification error:', err.message); }
  }
  const idx = localNotifications.findIndex(n => n.id === Number(id) && n.user_id === userId);
  if (idx >= 0) { localNotifications.splice(idx, 1); return true; }
  return false;
}

// ─── Audit Log Queries ──────────────────────────────────────────────

async function createAuditLog(userId, action, resource, resourceId, changes = {}, ipAddress = null, userAgent = null) {
  if (sql) {
    try {
      const changesJson = JSON.stringify(changes);
      const rows = await sql`
        INSERT INTO audit_logs (user_id, action, resource, resource_id, changes, ip_address, user_agent)
        VALUES (${userId}, ${action}, ${resource}, ${resourceId}, ${changesJson}::jsonb, ${ipAddress}, ${userAgent})
        RETURNING *
      `;
      return rows[0];
    } catch (err) {
      console.warn('DB createAuditLog error:', err.message);
    }
  }
  const log = { id: Date.now(), user_id: userId, action, resource, resource_id: resourceId, changes, ip_address: ipAddress, user_agent: userAgent, created_at: new Date().toISOString() };
  localAuditLogs.unshift(log);
  return log;
}

async function getAuditLogs({ page = 1, limit = 50, userId, resource, action } = {}) {
  const offset = (page - 1) * limit;
  if (sql) {
    try {
      let rows = [];
      let countResult = [{ count: 0 }];
      if (userId) {
        rows = await sql`SELECT al.*, u.name as user_name, u.email as user_email FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id WHERE al.user_id = ${userId} ORDER BY al.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
        countResult = await sql`SELECT COUNT(*) as count FROM audit_logs WHERE user_id = ${userId}`;
      } else if (resource) {
        rows = await sql`SELECT al.*, u.name as user_name, u.email as user_email FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id WHERE al.resource = ${resource} ORDER BY al.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
        countResult = await sql`SELECT COUNT(*) as count FROM audit_logs WHERE resource = ${resource}`;
      } else if (action) {
        rows = await sql`SELECT al.*, u.name as user_name, u.email as user_email FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id WHERE al.action = ${action} ORDER BY al.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
        countResult = await sql`SELECT COUNT(*) as count FROM audit_logs WHERE action = ${action}`;
      } else {
        rows = await sql`SELECT al.*, u.name as user_name, u.email as user_email FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id ORDER BY al.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
        countResult = await sql`SELECT COUNT(*) as count FROM audit_logs`;
      }
      const total = countResult && countResult[0] && countResult[0].count ? Number(countResult[0].count) : 0;
      return { data: rows, total };
    } catch (err) {
      console.warn('DB getAuditLogs error:', err ? err.message : String(err));
    }
  }

  let logs = localAuditLogs;
  if (userId) logs = logs.filter(l => l.user_id === userId);
  if (resource) logs = logs.filter(l => l.resource === resource);
  if (action) logs = logs.filter(l => l.action === action);
  return { data: logs.slice(offset, offset + limit), total: logs.length };
}

// ─── User Admin Queries ─────────────────────────────────────────────

async function listUsers({ page = 1, limit = 25, search } = {}) {
  const offset = (page - 1) * limit;
  if (sql) {
    try {
      let rows, countResult;
      if (search) {
        const s = `%${search}%`;
        rows = await sql`SELECT id, name, username, email, avatar, role, department, phone, provider, is_verified, is_active, created_at, last_login FROM users WHERE name ILIKE ${s} OR email ILIKE ${s} OR username ILIKE ${s} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
        countResult = await sql`SELECT COUNT(*) as count FROM users WHERE name ILIKE ${s} OR email ILIKE ${s} OR username ILIKE ${s}`;
      } else {
        rows = await sql`SELECT id, name, username, email, avatar, role, department, phone, provider, is_verified, is_active, created_at, last_login FROM users ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
        countResult = await sql`SELECT COUNT(*) as count FROM users`;
      }
      return { data: rows, total: Number(countResult[0].count) };
    } catch (err) {
      console.warn('DB listUsers error:', err.message);
    }
  }
  const users = Array.from(localUsers.values()).map(u => ({ id: u.id, name: u.name, username: u.username, email: u.email, role: u.role, provider: u.provider, is_active: u.is_active !== false, created_at: u.created_at }));
  return { data: users.slice(offset, offset + limit), total: users.length };
}

async function updateUserRole(id, role) {
  const validRoles = ['admin', 'manager', 'rep'];
  if (!validRoles.includes(role)) throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);

  if (sql) {
    try {
      const rows = await sql`UPDATE users SET role = ${role} WHERE id = ${id} RETURNING *`;
      return rows[0] || null;
    } catch (err) {
      console.warn('DB updateUserRole error:', err.message);
    }
  }

  const user = localUsers.get(Number(id));
  if (user) { user.role = role; return user; }
  return null;
}

async function deactivateUser(id) {
  if (sql) {
    try {
      const rows = await sql`UPDATE users SET is_active = FALSE WHERE id = ${id} RETURNING *`;
      return rows[0] || null;
    } catch (err) {
      console.warn('DB deactivateUser error:', err.message);
    }
  }
  const user = localUsers.get(Number(id));
  if (user) { user.is_active = false; return user; }
  return null;
}

module.exports = {
  initDB,
  getDb,
  findUserByGoogleId,
  findUserByEmail,
  findUserByIdentifier,
  findUserById,
  findUserByVerificationToken,
  findUserByResetToken,
  createPasswordUser,
  verifyUser,
  updateVerificationToken,
  setPasswordResetToken,
  resetUserPassword,
  updateUserPassword,
  recordFailedAttempt,
  resetFailedAttempts,
  updateUserProfile,
  upsertGoogleUser,
  recordLogin,
  // Notifications
  createNotification,
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  // Audit
  createAuditLog,
  getAuditLogs,
  // Admin
  listUsers,
  updateUserRole,
  deactivateUser
};
