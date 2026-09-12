/**
 * SmartPay CRM — Email Templates Route Module
 * Manages email templates and variable placeholder previews.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crmStore = require('../crm-store');

// ─── GET /api/templates (List Templates) ─────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const snapshot = await crmStore.snapshot();
    res.json({ data: snapshot.email_templates || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch email templates.' });
  }
});

// ─── POST /api/templates (Create Template) ───────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, subject, category = 'general', body_html, variables = '' } = req.body;
    if (!name || !subject || !body_html) {
      return res.status(400).json({ error: 'Name, subject, and body HTML are required.' });
    }

    const template = await crmStore.create('email_templates', {
      name: String(name).trim(),
      subject: String(subject).trim(),
      category,
      body_html,
      variables,
      is_active: true,
      created_at: new Date().toISOString()
    });

    res.status(201).json(template);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create email template.' });
  }
});

// ─── POST /api/templates/preview (Live Variable Interpolation) ──────
router.post('/preview', requireAuth, async (req, res) => {
  try {
    const { template_id, variables_data = {} } = req.body;
    const template = await crmStore.getById('email_templates', template_id);
    if (!template) return res.status(404).json({ error: 'Template not found.' });

    let renderedSubject = template.subject;
    let renderedBody = template.body_html;

    Object.entries(variables_data).forEach(([key, val]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      renderedSubject = renderedSubject.replace(regex, val || '');
      renderedBody = renderedBody.replace(regex, val || '');
    });

    res.json({
      subject: renderedSubject,
      body_html: renderedBody
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to render template preview.' });
  }
});

module.exports = router;
