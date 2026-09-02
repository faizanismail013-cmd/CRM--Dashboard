/**
 * SmartPay CRM — Neon Database Connection
 * Handles PostgreSQL connection via Neon serverless driver
 * and provides user management queries.
 */

const { neon } = require('@neondatabase/serverless');

let sql;

/**
 * Initialize the database connection and create tables if needed.
 */
async function initDB() {
  try {
    sql = neon(process.env.DATABASE_URL);

    // Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        google_id VARCHAR(255) UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        avatar VARCHAR(512),
        provider VARCHAR(50) DEFAULT 'google',
        role VARCHAR(50) DEFAULT 'Sales Rep',
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP DEFAULT NOW()
      )
    `;

    // Create login_history table
    await sql`
      CREATE TABLE IF NOT EXISTS login_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        login_at TIMESTAMP DEFAULT NOW(),
        ip_address VARCHAR(50),
        user_agent TEXT
      )
    `;

    // Create CRM tables
    await sql`CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, initial VARCHAR(10), logo VARCHAR(50), industry VARCHAR(100),
      owner VARCHAR(100), status VARCHAR(50), activity VARCHAR(100), created BIGINT, tags JSONB DEFAULT '[]'::jsonb
    )`;

    await sql`CREATE TABLE IF NOT EXISTS deals (
      id SERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL, company VARCHAR(255), value INTEGER, stage VARCHAR(100),
      probability INTEGER, owner VARCHAR(100), due VARCHAR(50), month VARCHAR(50), tag VARCHAR(100)
    )`;

    await sql`CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL, company VARCHAR(255), due VARCHAR(100),
      bucket VARCHAR(50), priority VARCHAR(50), done BOOLEAN DEFAULT false, assignee VARCHAR(100)
    )`;

    await sql`CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, initials VARCHAR(10), title VARCHAR(100),
      email VARCHAR(255), phone VARCHAR(50), primary_contact BOOLEAN DEFAULT false
    )`;

    await sql`CREATE TABLE IF NOT EXISTS activities (
      id SERIAL PRIMARY KEY, type VARCHAR(50), icon VARCHAR(10), text TEXT, time VARCHAR(100)
    )`;

    await sql`CREATE TABLE IF NOT EXISTS letters (
      id SERIAL PRIMARY KEY, type VARCHAR(50), employeeName VARCHAR(255), recipientEmail VARCHAR(255),
      subject VARCHAR(255), createdAt VARCHAR(100), status VARCHAR(50)
    )`;

    await sql`CREATE TABLE IF NOT EXISTS stages (
      name VARCHAR(100) PRIMARY KEY, probability INTEGER, color VARCHAR(50)
    )`;

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

/**
 * Find a user by their Google ID.
 */
async function findUserByGoogleId(googleId) {
  if (!sql) return null;
  try {
    const rows = await sql`SELECT * FROM users WHERE google_id = ${googleId}`;
    return rows[0] || null;
  } catch (error) {
    console.error('DB Error (findUserByGoogleId):', error.message);
    return null;
  }
}

/**
 * Find a user by their email.
 */
async function findUserByEmail(email) {
  if (!sql) return null;
  try {
    const rows = await sql`SELECT * FROM users WHERE email = ${email}`;
    return rows[0] || null;
  } catch (error) {
    console.error('DB Error (findUserByEmail):', error.message);
    return null;
  }
}

/**
 * Find a user by their ID.
 */
async function findUserById(id) {
  if (!sql) return null;
  try {
    const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
    return rows[0] || null;
  } catch (error) {
    console.error('DB Error (findUserById):', error.message);
    return null;
  }
}

/**
 * Create or update a user from Google OAuth profile.
 * If user exists, update last_login. If not, create new user.
 */
async function upsertGoogleUser(profile) {
  if (!sql) {
    // Return a mock user when DB is offline
    return {
      id: 1,
      google_id: profile.id,
      email: profile.emails?.[0]?.value || 'user@example.com',
      name: profile.displayName || 'User',
      avatar: profile.photos?.[0]?.value || null,
      provider: 'google',
      role: 'Sales Rep'
    };
  }

  try {
    const email = profile.emails?.[0]?.value;
    const name = profile.displayName;
    const avatar = profile.photos?.[0]?.value || null;
    const googleId = profile.id;

    // Try to find existing user
    const existing = await findUserByGoogleId(googleId);

    if (existing) {
      // Update last login
      await sql`UPDATE users SET last_login = NOW(), avatar = ${avatar} WHERE google_id = ${googleId}`;
      return existing;
    }

    // Create new user
    const rows = await sql`
      INSERT INTO users (google_id, email, name, avatar, provider)
      VALUES (${googleId}, ${email}, ${name}, ${avatar}, 'google')
      RETURNING *
    `;
    return rows[0];
  } catch (error) {
    console.error('DB Error (upsertGoogleUser):', error.message);
    // Return mock user on error
    return {
      id: Date.now(),
      google_id: profile.id,
      email: profile.emails?.[0]?.value || 'user@example.com',
      name: profile.displayName || 'User',
      avatar: profile.photos?.[0]?.value || null,
      provider: 'google',
      role: 'Sales Rep'
    };
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

module.exports = { initDB, findUserByGoogleId, findUserByEmail, findUserById, upsertGoogleUser, recordLogin, getDb };
