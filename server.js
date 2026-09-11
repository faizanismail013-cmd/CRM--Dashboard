// @ts-nocheck
/**
 * SmartPay CRM — Express Server (Restructured)
 * 
 * Clean entry point that mounts route modules:
 * - Auth (login, register, Google OAuth, verification, password reset)
 * - CRM (CRUD with pagination, filtering, search, import/export)
 * - Analytics (dashboard metrics, pipeline, forecast, rep performance)
 * - Notifications (real-time notification system)
 * - Audit Logs (admin-only mutation trail)
 * - Admin (user management, RBAC, bootstrap)
 * - WebSocket (real-time event broadcasting)
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cors = require('cors');
const path = require('path');
const { Resend } = require('resend');

const {
  initDB,
  findUserById,
  upsertGoogleUser,
  updateUserProfile
} = require('./db');

const {
  cookieSession,
  signUserToken,
  getCookieOptions,
  requireAuth
} = require('./middleware/auth');

const crmStore = require('./crm-store');
const { sendLetterEmail, getEmailProviderStatus, isValidEmail, initMailService } = require('./services/mail');
const { generateLetterPDF } = require('./services/pdf-generator');

const app = express();
const PORT = process.env.PORT || 3000;

let serverWsBroadcast = null;

// Trust Vercel / reverse proxy for secure cookies
app.set('trust proxy', 1);

// ─── Mail & Resend Client Initialization ────────────────────────────
initMailService();

let resend;
try {
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_your_resend_api_key_here') {
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('✅ Resend email client initialized');
  } else {
    console.log('⚠️  Resend API key not configured — email sending will use SMTP if configured');
  }
} catch (error) {
  console.error('⚠️  Resend initialization failed:', error.message);
}

// ─── Middleware ──────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieSession);
app.use(passport.initialize());

// ─── Helper ─────────────────────────────────────────────────────────
function getAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${protocol}://${host}`;
}

// ─── Google OAuth 2.0 Strategy ───────────────────────────────────────
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

      // Send welcome email for new users
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
                <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">Hi ${profile.displayName},</p>
                <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">You've successfully signed in. Your workspace is ready.</p>
                <p style="color: #a0aec0; font-size: 12px; text-align: center;">SmartPay CRM · Your business workspace</p>
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

// ─── Mount Auth Routes ──────────────────────────────────────────────
const authModule = require('./routes/auth');
authModule.init({ resendClient: resend, appUrlFn: getAppUrl, googleId: googleClientId });

// Mount OAuth routes at /auth/* and API auth routes at /api/auth/*
app.use('/auth', authModule.router);
app.use('/api/auth', authModule.router);

// ─── Mount CRM Routes ───────────────────────────────────────────────
const { router: crmRouter, setWsBroadcast } = require('./routes/crm');
app.use('/api/crm', crmRouter);

// ─── Mount Analytics Routes ─────────────────────────────────────────
const analyticsRouter = require('./routes/analytics');
app.use('/api/analytics', analyticsRouter);

// ─── Mount Notifications Routes ─────────────────────────────────────
const notificationsRouter = require('./routes/notifications');
app.use('/api/notifications', notificationsRouter);

// ─── Mount Audit Routes ─────────────────────────────────────────────
const auditRouter = require('./routes/audit');
app.use('/api/audit-logs', auditRouter);

// ─── Mount Admin Routes ─────────────────────────────────────────────
const adminRouter = require('./routes/admin');
app.use('/api/admin', adminRouter);

// ─── Mount Products Routes ──────────────────────────────────────────
const productsRouter = require('./routes/products');
app.use('/api/products', productsRouter);

// ─── Mount Quotations Routes ────────────────────────────────────────
const quotationsRouter = require('./routes/quotations');
app.use('/api/quotations', quotationsRouter);

// ─── Mount Invoices Routes ──────────────────────────────────────────
const invoicesRouter = require('./routes/invoices');
app.use('/api/invoices', invoicesRouter);

// ─── Mount Purchase Orders Routes ───────────────────────────────────
const purchaseOrdersRouter = require('./routes/purchase_orders');
app.use('/api/purchase-orders', purchaseOrdersRouter);

// ─── Mount Teams Routes ─────────────────────────────────────────────
const teamsRouter = require('./routes/teams');
app.use('/api/teams', teamsRouter);

// ─── Mount Commissions Routes ───────────────────────────────────────
const commissionsRouter = require('./routes/commissions');
app.use('/api/commissions', commissionsRouter);

// ─── Mount Targets Routes ───────────────────────────────────────────
const targetsRouter = require('./routes/targets');
app.use('/api/targets', targetsRouter);

// ─── User Profile Endpoints ─────────────────────────────────────────

app.get('/api/user', requireAuth, async (req, res) => {
  const sessionUser = req.user || req.session?.user;
  if (!sessionUser) return res.status(401).json({ error: 'Not authenticated' });
  const fresh = await findUserById(sessionUser.id);
  const u = fresh || sessionUser;
  res.json({
    id: u.id, name: u.name, username: u.username || null,
    email: u.email, avatar: u.avatar || null,
    role: u.role || 'rep', phone: u.phone || null,
    department: u.department || 'Sales',
    created_at: u.created_at || null, provider: u.provider || 'local',
    is_verified: u.is_verified !== false
  });
});

app.put('/api/user/profile', requireAuth, async (req, res) => {
  const sessionUser = req.user || req.session?.user;
  if (!sessionUser) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const name = req.body.name !== undefined ? String(req.body.name).trim() : undefined;
    const phone = req.body.phone !== undefined ? String(req.body.phone).trim() : undefined;
    const department = req.body.department !== undefined ? String(req.body.department).trim() : undefined;
    const avatar = req.body.avatar !== undefined ? String(req.body.avatar).trim() : undefined;

    if (name !== undefined && name.length < 2) return res.status(400).json({ error: 'Full name must be at least 2 characters.' });

    const updated = await updateUserProfile(sessionUser.id, { name, phone, department, avatar });
    if (!updated) return res.status(404).json({ error: 'User not found.' });

    const token = signUserToken(updated);
    res.cookie('smartpay_auth', token, getCookieOptions(req));
    req.user = updated;
    if (req.session) req.session.user = updated;

    res.json({
      success: true, message: 'Profile updated successfully.',
      user: {
        id: updated.id, name: updated.name, username: updated.username || sessionUser.username || null,
        email: updated.email, avatar: updated.avatar,
        role: updated.role || sessionUser.role || 'rep',
        phone: updated.phone || null, department: updated.department || 'Sales',
        created_at: updated.created_at || sessionUser.created_at || null,
        provider: updated.provider || 'local', is_verified: updated.is_verified !== false
      }
    });
  } catch (error) {
    console.error('Profile update error:', error.message);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// ─── Email API ──────────────────────────────────────────────────────

app.get('/api/mail-status', requireAuth, (req, res) => {
  res.json(getEmailProviderStatus());
});

app.post('/api/send-letter', requireAuth, async (req, res) => {
  const { to, subject, html, letterType = 'offer', letterData = {} } = req.body;
  const sessionUser = req.user || req.session?.user;
  const userId = sessionUser?.id || null;

  // 1. Validation
  if (!to || !isValidEmail(to)) {
    return res.status(400).json({ success: false, error: `Invalid recipient email address: "${to || ''}".` });
  }
  if (!subject || !String(subject).trim()) {
    return res.status(400).json({ success: false, error: 'Email subject is required.' });
  }

  const validTypes = ['offer', 'appointment', 'resignation', 'termination', 'experience'];
  const normalizedType = validTypes.includes(letterType) ? letterType : 'offer';
  const employeeName = (letterData.employeeName || req.body.employeeName || 'Candidate').trim();

  // Generate safe filename for PDF attachment
  const safeName = employeeName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Employee';
  const typeLabel = normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1);
  const filename = `${typeLabel}_Letter_${safeName}.pdf`;

  // 2. Generate PDF Attachment Buffer
  let pdfBuffer = null;
  try {
    pdfBuffer = await generateLetterPDF(normalizedType, {
      ...letterData,
      employeeName,
      recipientEmail: to
    });
  } catch (pdfErr) {
    console.error('PDF generation error:', pdfErr.message);
    return res.status(500).json({ success: false, error: `Failed to generate PDF document: ${pdfErr.message}` });
  }

  // 3. Prepare Email HTML
  const emailHtml = html || `
    <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 650px; margin: 0 auto; padding: 30px 20px; color: #1f2937;">
      <div style="background: #2563EB; height: 4px; border-radius: 2px 2px 0 0;"></div>
      <div style="background: #ffffff; padding: 28px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <h2 style="margin-top: 0; color: #111827; font-size: 20px;">${subject}</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #374151;">Dear ${employeeName},</p>
        <p style="font-size: 14px; line-height: 1.6; color: #4b5563;">
          Please find attached your official <strong>${typeLabel} Letter</strong> from <strong>SmartPay India Pvt. Ltd.</strong> in PDF format.
        </p>
        <div style="margin: 20px 0; padding: 14px 18px; background: #f8fafc; border-left: 4px solid #2563EB; border-radius: 4px;">
          <p style="margin: 0; font-size: 13px; color: #64748b;">
            📎 <strong>Attached Document:</strong> ${filename}
          </p>
        </div>
        <p style="font-size: 14px; line-height: 1.6; color: #4b5563;">
          Kindly review the attached letter and follow the required instructions. If you have questions, please reply directly to this email or contact HR.
        </p>
        <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 13px; color: #94a3b8;">
          <strong style="color: #475569;">SmartPay India HR Operations</strong><br/>
          SmartPay India Pvt. Ltd. · 12th Floor, One World Centre, Bengaluru
        </div>
      </div>
    </div>
  `;

  // 4. Send Email via Mail Service (SMTP / Resend)
  try {
    const sendResult = await sendLetterEmail({
      to,
      subject,
      html: emailHtml,
      pdfBuffer,
      filename
    });

    // 5. Save SUCCESS status into Database
    let savedLetter = null;
    try {
      savedLetter = await crmStore.create('letters', {
        type: normalizedType,
        employeeName,
        recipientEmail: to,
        subject,
        status: 'sent',
        createdAt: new Date().toISOString(),
        user_id: userId,
        error_message: null,
        sent_at: new Date().toISOString(),
        letter_data: JSON.stringify(letterData)
      });

      // Record activity in CRM
      await crmStore.create('activities', {
        type: 'email',
        icon: '✉',
        text: `<strong>Sent ${typeLabel} Letter</strong> with PDF attachment to ${employeeName} (${to})`,
        time: 'Just now',
        user_id: userId
      });

      if (serverWsBroadcast) {
        serverWsBroadcast('letters:create', savedLetter);
        serverWsBroadcast('activities:create', { text: `Sent ${typeLabel} Letter to ${to}`, time: 'Just now' });
      }
    } catch (dbErr) {
      console.error('Failed to log letter into DB:', dbErr.message);
    }

    return res.json({
      success: true,
      message: `${typeLabel} Letter sent successfully to ${to} with PDF attachment.`,
      letter: savedLetter,
      provider: sendResult.provider,
      messageId: sendResult.messageId
    });

  } catch (sendErr) {
    console.error('Letter email sending failed:', sendErr.message);

    // 6. Save FAILED status into Database
    let failedLetter = null;
    try {
      failedLetter = await crmStore.create('letters', {
        type: normalizedType,
        employeeName,
        recipientEmail: to,
        subject,
        status: 'failed',
        createdAt: new Date().toISOString(),
        user_id: userId,
        error_message: sendErr.message,
        sent_at: null,
        letter_data: JSON.stringify(letterData)
      });

      if (serverWsBroadcast) {
        serverWsBroadcast('letters:create', failedLetter);
      }
    } catch (dbErr) {
      console.error('Failed to log failed letter into DB:', dbErr.message);
    }

    return res.status(500).json({
      success: false,
      error: sendErr.message || 'Failed to send letter email.',
      letter: failedLetter
    });
  }
});

// ─── Static Files ───────────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));

// ─── Global Error Handler ───────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Database & Server Initialization ───────────────────────────────
const dbReady = initDB();

if (process.env.VERCEL !== '1') {
  dbReady.then(() => {
    const server = http.createServer(app);

    // Initialize WebSocket
    try {
      const { initWebSocket, broadcast } = require('./services/websocket');
      initWebSocket(server);
      serverWsBroadcast = broadcast;
      setWsBroadcast(broadcast);
    } catch (wsErr) {
      console.warn('⚠️  WebSocket initialization skipped:', wsErr.message);
    }

    server.listen(PORT, () => {
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`  🚀 SmartPay CRM running on http://localhost:${PORT}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('  📡 API Endpoints:');
      console.log('     /api/auth/*          — Authentication');
      console.log('     /api/crm/*           — CRM Resources (paginated)');
      console.log('     /api/analytics/*     — Dashboard Analytics');
      console.log('     /api/notifications/* — Notifications');
      console.log('     /api/audit-logs      — Audit Trail (admin)');
      console.log('     /api/admin/*         — User Management (admin)');
      console.log('     /ws                  — WebSocket (real-time)');
      console.log('');
      if (!googleClientId || googleClientId === 'your_google_client_id_here') {
        console.log('  📌 Demo mode active — Google OAuth not configured');
        console.log('');
      }
    });
  }).catch(console.error);
}

// ─── Export for Vercel ──────────────────────────────────────────────
module.exports = app;
