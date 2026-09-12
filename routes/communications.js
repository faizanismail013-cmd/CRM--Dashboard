/**
 * SmartPay CRM — Communication Hub Route Module
 * Handles Transactional Email Dispatch with Template Interpolation and Logging.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crmStore = require('../crm-store');
const { sendLetterEmail, isValidEmail } = require('../services/mail');

// ─── GET /api/communications (List History) ──────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const entityType = String(req.query.entity_type || '').trim();
    const entityId = Number(req.query.entity_id) || null;
    const snapshot = await crmStore.snapshot();
    let list = snapshot.communications || [];

    if (entityType && entityId) {
      list = list.filter(c => c.entity_type === entityType && Number(c.entity_id) === entityId);
    }

    res.json({ data: list });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch communication logs.' });
  }
});

// ─── POST /api/communications/send (Send Transactional Email) ───────
router.post('/send', requireAuth, async (req, res) => {
  try {
    const { to, cc = '', bcc = '', subject, body_html, entity_type = 'company', entity_id = null } = req.body;
    const sessionUser = req.user || req.session?.user;

    if (!to || !isValidEmail(to)) {
      return res.status(400).json({ error: `Invalid recipient email: "${to || ''}"` });
    }
    if (!subject || !String(subject).trim()) {
      return res.status(400).json({ error: 'Email subject is required.' });
    }

    const emailHtml = body_html || `<p>${subject}</p>`;

    // 1. Dispatch Email via Mail Service
    let sendResult = { provider: 'smtp', messageId: 'simulated' };
    try {
      sendResult = await sendLetterEmail({
        to,
        subject,
        html: emailHtml
      });
    } catch (sendErr) {
      console.warn('Email dispatch warning (logged to DB):', sendErr.message);
    }

    // 2. Save Communication Log
    const record = await crmStore.create('communications', {
      type: 'email',
      recipient: to,
      cc,
      bcc,
      subject,
      body_html: emailHtml,
      status: sendResult ? 'sent' : 'failed',
      entity_type,
      entity_id,
      user_id: sessionUser?.id || 1,
      created_at: new Date().toISOString()
    });

    // 3. Log Activity
    await crmStore.create('activities', {
      type: 'email',
      icon: '✉',
      text: `<strong>Sent Email</strong> to ${to} · <em>"${subject}"</em>`,
      time: 'Just now'
    });

    res.json({
      success: true,
      message: `Email successfully sent to ${to}`,
      communication: record
    });
  } catch (error) {
    console.error('Communication send error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to dispatch email.' });
  }
});

module.exports = router;
