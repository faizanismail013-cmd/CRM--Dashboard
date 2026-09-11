// @ts-nocheck
/**
 * SmartPay CRM — Auth & RBAC Middleware
 */

const crypto = require('crypto');

const SESSION_SECRET = process.env.SESSION_SECRET || 'smartpay-crm-secret-change-me-in-production';

// ─── Token Signing & Verification ────────────────────────────────────

function signUserToken(user, rememberMe = false) {
  const duration = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const payload = {
    id: user.id,
    google_id: user.google_id || null,
    name: user.name,
    username: user.username || null,
    email: user.email,
    avatar: user.avatar || null,
    role: user.role || 'rep',
    phone: user.phone || null,
    department: user.department || 'Sales',
    provider: user.provider || 'local',
    created_at: user.created_at || null,
    exp: Date.now() + duration
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyUserToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const idx = cookie.indexOf('=');
      if (idx > -1) {
        list[cookie.slice(0, idx).trim()] = decodeURIComponent(cookie.slice(idx + 1).trim());
      }
    });
  }
  return list;
}

function getCookieOptions(req, rememberMe = false) {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge
  };
}

// ─── Cookie Session Middleware ───────────────────────────────────────

function cookieSession(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies.smartpay_auth;
  if (token) {
    const user = verifyUserToken(token);
    if (user) {
      req.user = user;
    }
  }
  if (!req.session) req.session = {};
  if (req.user) req.session.user = req.user;
  req.isAuthenticated = () => Boolean(req.user);
  next();
}

// ─── Auth Guards ─────────────────────────────────────────────────────

/**
 * Require any authenticated user
 */
function requireAuth(req, res, next) {
  if (req.isAuthenticated() || req.session?.user) return next();
  return res.status(401).json({ error: 'Authentication required.' });
}

/**
 * Require one of the specified roles
 * Usage: requireRole('admin') or requireRole('admin', 'manager')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.user || req.session?.user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const userRole = (user.role || 'rep').toLowerCase();
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action.' });
    }
    next();
  };
}

/**
 * RBAC-aware resource filter:
 * - Admin: sees everything
 * - Manager: sees everything (team-wide view)
 * - Rep: sees only own records (filters by user_id)
 *
 * Sets req.rbacFilter with { user_id } if filtering is needed
 */
function rbacFilter(req, res, next) {
  const user = req.user || req.session?.user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });

  const role = (user.role || 'rep').toLowerCase();
  if (role === 'admin' || role === 'manager') {
    req.rbacFilter = {}; // No filter — see everything
  } else {
    req.rbacFilter = { user_id: user.id }; // Rep sees own records
  }
  next();
}

/**
 * Check if user can modify a specific record.
 * Admin can modify any. Manager can modify any. Rep can modify own only.
 */
function canModify(userRole, recordUserId, currentUserId) {
  if (userRole === 'admin' || userRole === 'manager') return true;
  return recordUserId === currentUserId;
}

/**
 * Check if user can delete records
 */
function canDelete(userRole) {
  return userRole === 'admin' || userRole === 'manager';
}

// ─── Rate Limiting ───────────────────────────────────────────────────

const loginAttempts = new Map();

function checkRateLimit(key) {
  const record = loginAttempts.get(key);
  if (!record) return { allowed: true };
  if (record.lockUntil && Date.now() < record.lockUntil) {
    const waitSec = Math.ceil((record.lockUntil - Date.now()) / 1000);
    return { allowed: false, waitSec };
  }
  if (Date.now() - record.lastAttempt > 15 * 60 * 1000) {
    loginAttempts.delete(key);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordLoginFailure(key) {
  const now = Date.now();
  const record = loginAttempts.get(key) || { count: 0, lastAttempt: now };
  record.count += 1;
  record.lastAttempt = now;
  if (record.count >= 5) {
    record.lockUntil = now + 15 * 60 * 1000;
  }
  loginAttempts.set(key, record);
  return record;
}

function clearLoginFailures(key) {
  loginAttempts.delete(key);
}

module.exports = {
  signUserToken,
  verifyUserToken,
  parseCookies,
  getCookieOptions,
  cookieSession,
  requireAuth,
  requireRole,
  rbacFilter,
  canModify,
  canDelete,
  checkRateLimit,
  recordLoginFailure,
  clearLoginFailures
};
