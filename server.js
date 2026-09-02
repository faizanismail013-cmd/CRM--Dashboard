/**
 * SmartPay CRM — Express Server
 * 
 * Handles:
 * - Static file serving
 * - Google OAuth 2.0 authentication via Passport.js
 * - Neon PostgreSQL database connection
 * - Resend email integration
 * - Session management
 */

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cors = require('cors');
const path = require('path');
const { Resend } = require('resend');
const { initDB, upsertGoogleUser, findUserById, recordLogin } = require('./db');
const crmStore = require('./crm-store');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Resend Email Client ────────────────────────────────────────────
let resend;
try {
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_your_resend_api_key_here') {
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('✅ Resend email client initialized');
  } else {
    console.log('⚠️  Resend API key not configured — email sending disabled');
  }
} catch (error) {
  console.error('⚠️  Resend initialization failed:', error.message);
}

// ─── Middleware ──────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'smartpay-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// ─── Passport Configuration ─────────────────────────────────────────

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id || user.google_id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await findUserById(id);
    done(null, user || { id, name: 'User', email: 'user@example.com' });
  } catch (error) {
    done(null, { id, name: 'User', email: 'user@example.com' });
  }
});

// Google OAuth 2.0 Strategy
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback';

if (googleClientId && googleClientId !== 'your_google_client_id_here') {
  passport.use(new GoogleStrategy({
    clientID: googleClientId,
    clientSecret: googleClientSecret,
    callbackURL: googleCallbackUrl,
    scope: ['profile', 'email']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const user = await upsertGoogleUser(profile);

      // Send welcome email for new users via Resend
      if (resend && profile.emails?.[0]?.value) {
        try {
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
            to: profile.emails[0].value,
            subject: 'Welcome to SmartPay CRM',
            html: `
              <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
                <div style="text-align: center; margin-bottom: 32px;">
                  <h1 style="font-size: 24px; color: #0B2A5E; margin: 0;">Welcome to SmartPay CRM</h1>
                </div>
                <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">
                  Hi ${profile.displayName},
                </p>
                <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">
                  You've successfully signed in to SmartPay CRM. Your workspace is ready — start managing your pipeline, track deals, and generate HR letters right from your dashboard.
                </p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="http://localhost:3000" style="background: #1D5FD6; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                    Open Dashboard
                  </a>
                </div>
                <p style="color: #a0aec0; font-size: 12px; text-align: center;">
                  SmartPay CRM · Your business workspace
                </p>
              </div>
            `
          });
          console.log(`📧 Welcome email sent to ${profile.emails[0].value}`);
        } catch (emailError) {
          console.error('Email send failed:', emailError.message);
        }
      }

      done(null, user);
    } catch (error) {
      done(error, null);
    }
  }));
  console.log('✅ Google OAuth 2.0 strategy configured');
} else {
  console.log('⚠️  Google OAuth credentials not set — using demo mode');
}

// ─── Auth Routes ────────────────────────────────────────────────────

// Initiate Google OAuth
app.get('/auth/google', (req, res, next) => {
  if (!googleClientId || googleClientId === 'your_google_client_id_here') {
    // Demo mode: create a mock session
    req.session.user = {
      id: 1,
      name: 'Aarav Sharma',
      email: 'aarav@smartpay.in',
      avatar: null,
      provider: 'demo',
      role: 'Sales Manager'
    };
    return res.redirect('/');
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// Google OAuth callback
app.get('/auth/google/callback',
  (req, res, next) => {
    if (!googleClientId || googleClientId === 'your_google_client_id_here') {
      return res.redirect('/');
    }
    passport.authenticate('google', { failureRedirect: '/?error=auth_failed' })(req, res, next);
  },
  async (req, res) => {
    // Record login
    try {
      await recordLogin(req.user.id, req.ip, req.headers['user-agent']);
    } catch (e) { /* ignore */ }
    res.redirect('/');
  }
);

// Check auth status
app.get('/api/auth/status', (req, res) => {
  if (req.isAuthenticated() || req.session.user) {
    const user = req.user || req.session.user;
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role || 'Sales Rep'
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Email/password sign-in is intentionally a demo login until a credential
// provider is configured. It still creates a server session, so all CRM API
// calls use the same authentication flow as Google SSO.
app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || !password) {
    return res.status(400).json({ error: 'Enter a valid email address and password.' });
  }

  const name = email.split('@')[0].split(/[._-]/).map(part => part[0]?.toUpperCase() + part.slice(1)).join(' ') || 'User';
  req.session.user = { id: `demo:${email}`, name, email, avatar: null, provider: 'email', role: 'Sales Manager' };
  res.json({ authenticated: true, user: req.session.user });
});

// Logout
app.get('/api/auth/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.redirect('/');
    });
  });
});

// Get current user
app.get('/api/user', (req, res) => {
  if (req.isAuthenticated() || req.session.user) {
    const user = req.user || req.session.user;
    res.json(user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// ─── CRM API ───────────────────────────────────────────────────────

const crmResources = new Set(['companies', 'contacts', 'deals', 'tasks', 'activities', 'letters']);
const allowedFields = {
  companies: ['name', 'initial', 'logo', 'industry', 'owner', 'status', 'deals', 'activity', 'created', 'tags', 'source'],
  contacts: ['name', 'initials', 'title', 'email', 'phone', 'primary'],
  deals: ['title', 'company', 'value', 'stage', 'probability', 'owner', 'due', 'month', 'tag'],
  tasks: ['title', 'company', 'due', 'bucket', 'priority', 'done', 'assignee'],
  activities: ['type', 'icon', 'text', 'time'],
  letters: ['type', 'employeeName', 'recipientEmail', 'subject', 'createdAt', 'status']
};

function requireApiUser(req, res, next) {
  if (req.isAuthenticated() || req.session.user) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

function pickResourceFields(resource, body) {
  return allowedFields[resource].reduce((result, field) => {
    if (Object.hasOwn(body, field)) result[field] = body[field];
    return result;
  }, {});
}

function validateRecord(resource, record) {
  if (resource === 'companies' && !String(record.name || '').trim()) return 'Company name is required.';
  if (resource === 'contacts' && (!String(record.name || '').trim() || !/^\S+@\S+\.\S+$/.test(record.email || ''))) return 'A contact name and valid email are required.';
  if (resource === 'deals' && (!String(record.title || '').trim() || !String(record.company || '').trim() || !Number.isFinite(Number(record.value)) || Number(record.value) < 0)) return 'Deal title, company, and a valid value are required.';
  if (resource === 'tasks' && !String(record.title || '').trim()) return 'Task title is required.';
  if (resource === 'activities' && !String(record.text || '').trim()) return 'Activity details are required.';
  if (resource === 'letters' && !['offer', 'appointment', 'resignation', 'termination'].includes(record.type)) return 'A supported letter type is required.';
  return null;
}

app.get('/api/crm', requireApiUser, async (req, res, next) => {
  try { res.json(await crmStore.snapshot()); } catch (error) { next(error); }
});

app.get('/api/crm/:resource', requireApiUser, async (req, res, next) => {
  if (!crmResources.has(req.params.resource)) return res.status(404).json({ error: 'Unknown CRM resource.' });
  try { res.json(await crmStore.list(req.params.resource)); } catch (error) { next(error); }
});

app.post('/api/crm/:resource', requireApiUser, async (req, res, next) => {
  const { resource } = req.params;
  if (!crmResources.has(resource)) return res.status(404).json({ error: 'Unknown CRM resource.' });
  const record = pickResourceFields(resource, req.body || {});
  if (resource === 'companies') Object.assign(record, { initial: record.name?.trim()[0]?.toUpperCase(), logo: record.logo || 'logo-blue', owner: record.owner || req.user?.name || req.session.user?.name || 'Unassigned', status: String(record.status || 'lead').toLowerCase(), deals: 0, activity: 'Just now', created: Date.now(), tags: Array.isArray(record.tags) ? record.tags : [] });
  if (resource === 'contacts') Object.assign(record, { initials: record.initials || record.name?.split(' ').map(part => part[0]).join('').slice(0, 2), phone: record.phone || '—', primary: Boolean(record.primary) });
  if (resource === 'deals') Object.assign(record, { value: Number(record.value), probability: Number(record.probability || 10), stage: record.stage || 'New Lead', owner: record.owner || req.user?.name || req.session.user?.name || 'Unassigned', due: record.due || '—', month: record.month || 'Unscheduled', tag: record.tag || '' });
  if (resource === 'tasks') Object.assign(record, { done: Boolean(record.done), bucket: record.bucket || 'today', priority: record.priority || 'medium', due: record.due || 'Today', assignee: record.assignee || req.user?.name || req.session.user?.name || 'Unassigned', company: record.company || 'Unlinked task' });
  if (resource === 'activities') Object.assign(record, { icon: record.icon || { call: '☎', email: '✉', meeting: '▣', note: '▤' }[record.type] || '▤', time: record.time || 'Just now' });
  if (resource === 'letters') Object.assign(record, { createdAt: new Date().toISOString(), status: record.status || 'generated' });
  const error = validateRecord(resource, record);
  if (error) return res.status(400).json({ error });
  try { res.status(201).json(await crmStore.create(resource, record)); } catch (storeError) { next(storeError); }
});

app.patch('/api/crm/:resource/:id', requireApiUser, async (req, res, next) => {
  const { resource, id } = req.params;
  if (!crmResources.has(resource)) return res.status(404).json({ error: 'Unknown CRM resource.' });
  const updates = pickResourceFields(resource, req.body || {});
  if (Object.hasOwn(updates, 'value')) updates.value = Number(updates.value);
  if (Object.hasOwn(updates, 'probability')) updates.probability = Number(updates.probability);
  if (Object.hasOwn(updates, 'done')) updates.done = Boolean(updates.done);
  const error = validateRecord(resource, updates);
  if (error && Object.keys(updates).length === allowedFields[resource].length) return res.status(400).json({ error });
  try {
    const record = await crmStore.update(resource, id, updates);
    if (!record) return res.status(404).json({ error: 'Record not found.' });
    res.json(record);
  } catch (storeError) { next(storeError); }
});

app.delete('/api/crm/:resource/:id', requireApiUser, async (req, res, next) => {
  if (!crmResources.has(req.params.resource)) return res.status(404).json({ error: 'Unknown CRM resource.' });
  try {
    const deleted = await crmStore.remove(req.params.resource, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Record not found.' });
    res.status(204).end();
  } catch (error) { next(error); }
});

// ─── Email API ──────────────────────────────────────────────────────

// Send a letter via email
app.post('/api/send-letter', async (req, res) => {
  if (!req.isAuthenticated() && !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { to, subject, html } = req.body;
  if (!/^\S+@\S+\.\S+$/.test(to || '') || !String(subject || '').trim() || !String(html || '').trim()) {
    return res.status(400).json({ error: 'Recipient, subject, and letter content are required.' });
  }

  if (!resend) {
    return res.status(503).json({ error: 'Email service not configured. Add RESEND_API_KEY to .env' });
  }

  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to,
      subject,
      html
    });
    res.json({ success: true, id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Static Files ───────────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Start Server ───────────────────────────────────────────────────
async function start() {
  // Initialize database
  await initDB();

  app.listen(PORT, () => {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  🚀 SmartPay CRM running on http://localhost:${PORT}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    if (!googleClientId || googleClientId === 'your_google_client_id_here') {
      console.log('  📌 Demo mode active — Google OAuth not configured');
      console.log('     Update .env with your Google credentials to enable SSO');
      console.log('');
    }
  });
}

start().catch(console.error);
