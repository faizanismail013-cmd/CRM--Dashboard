/**
 * SmartPay CRM — Auth Routes
 * Registration, Login, Google OAuth, Email Verification, Password Reset
 */

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const router = express.Router();

const {
  signUserToken,
  getCookieOptions,
  checkRateLimit,
  recordLoginFailure,
  clearLoginFailures
} = require('../middleware/auth');

const {
  findUserByIdentifier,
  findUserByVerificationToken,
  findUserByResetToken,
  findUserById,
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
  createAuditLog,
  getDb
} = require('../db');

// These are injected by the server via router.locals or passed in
let resend, getAppUrl, googleClientId;

function init({ resendClient, appUrlFn, googleId }) {
  resend = resendClient;
  getAppUrl = appUrlFn;
  googleClientId = googleId;
}

// ─── Email Dispatchers ──────────────────────────────────────────────

async function sendVerificationEmail(req, toEmail, name, token) {
  const verifyUrl = `${getAppUrl(req)}/auth/verify?token=${token}`;
  console.log(`\n======================================================`);
  console.log(`📧 [EMAIL DISPATCH] Email Verification Link for ${toEmail}:`);
  console.log(`🔗 ${verifyUrl}`);
  console.log(`======================================================\n`);

  if (!resend) return { simulated: true, url: verifyUrl };

  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: toEmail,
      subject: 'Verify your email address — SmartPay CRM',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <div style="background: #0B2A5E; padding: 28px 32px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">smartpay <span style="font-size: 13px; opacity: 0.8; font-weight: 500;">CRM</span></h1>
          </div>
          <div style="padding: 36px 32px; color: #1e293b; line-height: 1.6;">
            <h2 style="font-size: 20px; color: #0f172a; margin-top: 0;">Verify your email address</h2>
            <p>Hi ${name || 'there'},</p>
            <p>Thank you for registering with <strong>SmartPay CRM</strong>. Please verify your email address to activate your account.</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verifyUrl}" style="background: #1D5FD6; color: #ffffff; text-decoration: none; padding: 13px 30px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">Verify Email Address</a>
            </div>
            <p style="font-size: 13px; color: #64748b;">This verification link is valid for <strong>24 hours</strong>.</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
            <p style="font-size: 12px; color: #94a3b8; word-break: break-all;">If the button above does not work, copy and paste this link:<br/><a href="${verifyUrl}" style="color: #1D5FD6;">${verifyUrl}</a></p>
          </div>
        </div>
      `
    });
    return result;
  } catch (err) {
    console.error('Failed to send verification email:', err.message);
    return { error: err.message, url: verifyUrl };
  }
}

async function sendPasswordResetEmail(req, toEmail, name, token) {
  const resetUrl = `${getAppUrl(req)}/?reset_token=${token}#reset-password`;
  console.log(`\n======================================================`);
  console.log(`🔑 [EMAIL DISPATCH] Password Reset Link for ${toEmail}:`);
  console.log(`🔗 ${resetUrl}`);
  console.log(`======================================================\n`);

  if (!resend) return { simulated: true, url: resetUrl };

  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: toEmail,
      subject: 'Reset your password — SmartPay CRM',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <div style="background: #0B2A5E; padding: 28px 32px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">smartpay <span style="font-size: 13px; opacity: 0.8; font-weight: 500;">CRM</span></h1>
          </div>
          <div style="padding: 36px 32px; color: #1e293b; line-height: 1.6;">
            <h2 style="font-size: 20px; color: #0f172a; margin-top: 0;">Password Reset Request</h2>
            <p>Hi ${name || 'there'},</p>
            <p>We received a request to reset your password. Click the button below to choose a new secure password.</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetUrl}" style="background: #1D5FD6; color: #ffffff; text-decoration: none; padding: 13px 30px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">Reset Password</a>
            </div>
            <p style="font-size: 13px; color: #64748b;">This link expires in <strong>1 hour</strong>.</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
            <p style="font-size: 12px; color: #94a3b8; word-break: break-all;">If the button above does not work:<br/><a href="${resetUrl}" style="color: #1D5FD6;">${resetUrl}</a></p>
          </div>
        </div>
      `
    });
    return result;
  } catch (err) {
    console.error('Failed to send password reset email:', err.message);
    return { error: err.message, url: resetUrl };
  }
}

// ─── Google OAuth ───────────────────────────────────────────────────

router.get('/google', (req, res, next) => {
  if (!googleClientId || googleClientId === 'your_google_client_id_here') {
    // Demo mode
    const demoUser = {
      id: 1, name: 'Aarav Sharma', email: 'aarav@smartpay.in',
      avatar: null, provider: 'demo', role: 'admin'
    };
    const token = signUserToken(demoUser);
    res.cookie('smartpay_auth', token, getCookieOptions(req));
    return res.redirect('/');
  }
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  if (!googleClientId || googleClientId === 'your_google_client_id_here') {
    return res.redirect('/');
  }

  passport.authenticate('google', { session: false }, async (err, user, info) => {
    if (err || !user) {
      console.error('Google Auth Error:', err || info);
      const reason = encodeURIComponent(err?.message || 'Authentication failed');
      return res.redirect(`/?error=auth_failed&reason=${reason}`);
    }

    try { await recordLogin(user.id, req.ip, req.headers['user-agent']); } catch (e) { /* ignore */ }
    try { await createAuditLog(user.id, 'login', 'users', user.id, { provider: 'google' }, req.ip); } catch (e) { /* ignore */ }

    const token = signUserToken(user);
    res.cookie('smartpay_auth', token, getCookieOptions(req));
    res.redirect('/');
  })(req, res, next);
});

// ─── Auth Status ────────────────────────────────────────────────────

router.get('/status', async (req, res) => {
  const sessionUser = req.user || req.session?.user;
  if (sessionUser) {
    const fresh = await findUserById(sessionUser.id);
    const u = fresh || sessionUser;
    res.json({
      authenticated: true,
      user: {
        id: u.id, name: u.name, username: u.username || null,
        email: u.email, avatar: u.avatar || null,
        role: u.role || 'rep', phone: u.phone || null,
        department: u.department || 'Sales',
        created_at: u.created_at || null, provider: u.provider || 'local'
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// ─── Registration ───────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const username = String(req.body.username || '').trim().toLowerCase();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!name || name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
    if (!username || !/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) return res.status(400).json({ error: 'Username must be 3-30 alphanumeric characters.' });
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ error: 'Password must contain at least one uppercase letter and one number.' });

    const existing = await findUserByIdentifier(email) || await findUserByIdentifier(username);
    if (existing) {
      if (!existing.password_hash) {
        // Account exists from Google sign-in; seamlessly link password and log in
        const password_hash = await bcrypt.hash(password, 12);
        await updateUserPassword(existing.id, password_hash);
        if (!existing.username && username) await updateUserProfile(existing.id, { username });
        existing.password_hash = password_hash;
        existing.is_verified = true;
        const token = signUserToken(existing, true);
        res.cookie('smartpay_auth', token, getCookieOptions(req, true));
        try { await createAuditLog(existing.id, 'link_password', 'users', existing.id, { provider: 'google_linked' }, req.ip); } catch (e) { /* ignore */ }
        return res.status(200).json({
          success: true,
          authenticated: true,
          message: 'Password successfully linked to your account!',
          user: { id: existing.id, name: existing.name, username: existing.username || username, email: existing.email, avatar: existing.avatar, role: existing.role || 'rep' }
        });
      }
      if (existing.is_verified) return res.status(400).json({ error: 'An account with this email or username already exists. Please sign in.' });
      const newToken = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await updateVerificationToken(existing.id, newToken, expires);
      await sendVerificationEmail(req, existing.email, existing.name, newToken);
      return res.json({ success: true, message: 'A verification link has been sent to your email.', email: existing.email, requiresVerification: true });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const verification_token = crypto.randomBytes(32).toString('hex');
    const verification_token_expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const isDevOrOffline = process.env.NODE_ENV !== 'production' || !getDb();

    const newUser = await createPasswordUser({
      name,
      username,
      email,
      password_hash,
      verification_token,
      verification_token_expires,
      is_verified: isDevOrOffline
    });
    await sendVerificationEmail(req, email, name, verification_token);

    try { await createAuditLog(newUser.id, 'register', 'users', newUser.id, { email, username }, req.ip); } catch (e) { /* ignore */ }

    if (isDevOrOffline) {
      // Auto-login in development/offline so user can immediately proceed
      const token = signUserToken(newUser, true);
      res.cookie('smartpay_auth', token, getCookieOptions(req, true));
      return res.status(201).json({
        success: true,
        authenticated: true,
        message: 'Account registered and verified successfully!',
        email,
        requiresVerification: false,
        user: { id: newUser.id, name: newUser.name, username: newUser.username, email: newUser.email, avatar: newUser.avatar, role: newUser.role || 'rep' }
      });
    }

    return res.status(201).json({
      success: true, message: 'Account registered! Please verify your email.',
      email, requiresVerification: true,
      ...(process.env.NODE_ENV !== 'production' ? { devVerificationToken: verification_token } : {})
    });
  } catch (error) {
    console.error('Registration Error:', error.message);
    res.status(500).json({ error: error.message || 'Registration failed.' });
  }
});

// ─── Quick Verify (Instant verification fallback) ───────────────────

router.post('/quick-verify', async (req, res) => {
  try {
    const identifier = String(req.body.email || req.body.identifier || '').trim().toLowerCase();
    if (!identifier) return res.status(400).json({ error: 'Email or username is required.' });

    const user = await findUserByIdentifier(identifier);
    if (!user) return res.status(404).json({ error: 'No account found with this email or username.' });

    await verifyUser(user.id);
    user.is_verified = true;

    const token = signUserToken(user, true);
    res.cookie('smartpay_auth', token, getCookieOptions(req, true));

    try { await createAuditLog(user.id, 'quick_verify', 'users', user.id, {}, req.ip); } catch (e) { /* ignore */ }

    return res.json({
      success: true,
      authenticated: true,
      message: 'Account verified successfully!',
      user: { id: user.id, name: user.name, username: user.username, email: user.email, avatar: user.avatar, role: user.role || 'rep' }
    });
  } catch (error) {
    console.error('Quick verify error:', error.message);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// ─── Email Verification ─────────────────────────────────────────────

router.get('/verify', async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) return res.redirect('/?error=missing_token');

  try {
    const user = await findUserByVerificationToken(token);
    if (!user) return res.redirect('/?error=invalid_token');
    if (user.verification_token_expires && new Date() > new Date(user.verification_token_expires)) {
      return res.redirect(`/?error=expired_token&email=${encodeURIComponent(user.email)}`);
    }
    await verifyUser(user.id);
    return res.redirect(`/?verified=true&email=${encodeURIComponent(user.email)}`);
  } catch (error) {
    console.error('Verification error:', error.message);
    return res.redirect('/?error=verification_failed');
  }
});

router.post('/verify', async (req, res) => {
  const token = String(req.body.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Verification token is required.' });

  try {
    const user = await findUserByVerificationToken(token);
    if (!user) return res.status(400).json({ error: 'Verification token is invalid or has already been used.' });
    if (user.verification_token_expires && new Date() > new Date(user.verification_token_expires)) {
      return res.status(400).json({ error: 'Verification token has expired.', email: user.email });
    }
    await verifyUser(user.id);
    return res.json({ success: true, message: 'Email verified successfully!', email: user.email });
  } catch (error) {
    console.error('API Verification error:', error.message);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// ─── Resend Verification ────────────────────────────────────────────

router.post('/resend-verification', async (req, res) => {
  try {
    const identifier = String(req.body.email || req.body.identifier || '').trim().toLowerCase();
    if (!identifier) return res.status(400).json({ error: 'Please enter your email or username.' });

    const ipLimit = checkRateLimit(`resend:${req.ip}`);
    if (!ipLimit.allowed) return res.status(429).json({ error: `Please wait ${ipLimit.waitSec}s.` });

    const user = await findUserByIdentifier(identifier);
    if (user && !user.is_verified) {
      const newToken = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await updateVerificationToken(user.id, newToken, expires);
      await sendVerificationEmail(req, user.email, user.name, newToken);
    }

    recordLoginFailure(`resend:${req.ip}`);
    res.json({ success: true, message: 'If an unverified account exists, a new verification email has been sent.' });
  } catch (error) {
    console.error('Resend verification error:', error.message);
    res.status(500).json({ error: 'Failed to resend verification email.' });
  }
});

// ─── Login ──────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const identifier = String(req.body.identifier || req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const rememberMe = Boolean(req.body.rememberMe);

    if (!identifier || !password) return res.status(400).json({ error: 'Enter your username or email and password.' });

    const rateCheck = checkRateLimit(req.ip);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: `Too many failed attempts. Wait ${Math.ceil(rateCheck.waitSec / 60)} minutes.` });
    }

    const user = await findUserByIdentifier(identifier);
    if (!user) {
      await bcrypt.compare(password, '$2a$12$e8YQd2Y08V1N7rPj0Z8fGuvg3R2s0a5P7E3J6U4K8T0X2W4Z6Y8.');
      recordLoginFailure(req.ip);
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      const waitMin = Math.ceil((new Date(user.locked_until) - Date.now()) / (60 * 1000));
      return res.status(429).json({ error: `Account locked. Try again in ${waitMin} minutes.` });
    }

    // Google-created account without password
    if (!user.password_hash) {
      if (password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)) {
        const password_hash = await bcrypt.hash(password, 12);
        await updateUserPassword(user.id, password_hash);
        user.password_hash = password_hash;
        user.is_verified = true;
        try { await createAuditLog(user.id, 'link_password_on_login', 'users', user.id, { provider: 'google_linked' }, req.ip); } catch (e) { /* ignore */ }
      } else {
        return res.status(400).json({
          error: 'This account was created with Google sign-in. To enable email & password sign-in, enter a password with at least 8 characters, 1 uppercase letter, and 1 number.'
        });
      }
    } else {
      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatch) {
        recordLoginFailure(req.ip);
        const attemptInfo = await recordFailedAttempt(user.id);
        if (attemptInfo && attemptInfo.failed_login_attempts >= 5) {
          return res.status(429).json({ error: 'Account temporarily locked due to 5 consecutive failed login attempts. Try again in 15 minutes.' });
        }
        const remaining = 5 - (attemptInfo?.failed_login_attempts || 0);
        const warning = (remaining > 0 && remaining <= 2) ? ` (${remaining} attempt${remaining > 1 ? 's' : ''} remaining before temporary lockout)` : '';
        return res.status(401).json({ error: `Invalid username/email or password.${warning}` });
      }
    }

    clearLoginFailures(req.ip);
    await resetFailedAttempts(user.id);

    if (!user.is_verified) {
      if (process.env.NODE_ENV !== 'production' || !getDb()) {
        await verifyUser(user.id);
        user.is_verified = true;
      } else {
        return res.status(403).json({ error: 'unverified', email: user.email, message: 'Please verify your email address.' });
      }
    }

    if (user.is_active === false) {
      return res.status(403).json({ error: 'Your account has been deactivated. Contact an administrator.' });
    }

    const token = signUserToken(user, rememberMe);
    res.cookie('smartpay_auth', token, getCookieOptions(req, rememberMe));

    try { await recordLogin(user.id, req.ip, req.headers['user-agent']); } catch (e) { /* ignore */ }
    try { await createAuditLog(user.id, 'login', 'users', user.id, { provider: user.provider || 'local' }, req.ip); } catch (e) { /* ignore */ }

    return res.json({
      authenticated: true,
      user: { id: user.id, name: user.name, username: user.username, email: user.email, avatar: user.avatar, role: user.role || 'rep' }
    });
  } catch (error) {
    console.error('Login Error:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred during login.' });
  }
});

// ─── Forgot Password ───────────────────────────────────────────────

router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || req.body.identifier || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Please enter your email address.' });

    const ipLimit = checkRateLimit(`forgot:${req.ip}`);
    if (!ipLimit.allowed) return res.status(429).json({ error: `Please wait ${ipLimit.waitSec}s.` });

    const user = await findUserByIdentifier(email);
    if (user && user.email) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000);
      await setPasswordResetToken(user.id, resetToken, resetExpires);
      await sendPasswordResetEmail(req, user.email, user.name, resetToken);
    }

    recordLoginFailure(`forgot:${req.ip}`);
    res.json({ success: true, message: 'If an account exists, a password reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error.message);
    res.status(500).json({ error: 'Failed to process password reset.' });
  }
});

// ─── Reset Password ────────────────────────────────────────────────

router.post('/reset-password', async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const newPassword = String(req.body.password || req.body.newPassword || '');

    if (!token) return res.status(400).json({ error: 'Reset token is required.' });
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) return res.status(400).json({ error: 'Password must contain at least one uppercase letter and one number.' });

    const user = await findUserByResetToken(token);
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or has been used.' });
    if (user.reset_token_expires && new Date() > new Date(user.reset_token_expires)) {
      return res.status(400).json({ error: 'This reset link has expired.' });
    }

    const password_hash = await bcrypt.hash(newPassword, 12);
    await resetUserPassword(user.id, password_hash);

    try { await createAuditLog(user.id, 'password_reset', 'users', user.id, {}, req.ip); } catch (e) { /* ignore */ }

    res.json({ success: true, message: 'Password reset successfully!' });
  } catch (error) {
    console.error('Reset password error:', error.message);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// ─── Logout ─────────────────────────────────────────────────────────

const logoutHandler = async (req, res) => {
  const userId = req.user?.id;
  res.clearCookie('smartpay_auth', { path: '/' });
  req.user = null;
  if (req.session) req.session.user = null;

  try { if (userId) await createAuditLog(userId, 'logout', 'users', userId, {}, req.ip); } catch (e) { /* ignore */ }

  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({ success: true, message: 'Logged out successfully' });
  }
  res.redirect('/');
};

router.get('/logout', logoutHandler);
router.post('/logout', logoutHandler);

module.exports = { router, init };
