/**
 * SmartPay CRM — Automation Engine Route Module
 * Configurable Event-Condition-Action automation rules, logs, settings, and test runner.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crmStore = require('../crm-store');
const { triggerAutomation, getAutomationSettings, testAutomationRule } = require('../services/automationService');
const { runDailyAutomationJob } = require('../services/scheduler');

// ─── GET /api/automations ───────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const snapshot = await crmStore.snapshot();
    const settings = await getAutomationSettings();
    res.json({
      data: snapshot.automations || [],
      logs: snapshot.automation_logs || [],
      settings
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch automations.' });
  }
});

// ─── POST /api/automations (Create Rule) ─────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, event, condition_json = '{}', action_json, description } = req.body;
    if (!name || !event || !action_json) {
      return res.status(400).json({ error: 'Name, event trigger, and action JSON are required.' });
    }

    const rule = await crmStore.create('automations', {
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      event: String(event).trim(),
      event_type: String(event).trim(),
      condition_json: typeof condition_json === 'string' ? condition_json : JSON.stringify(condition_json),
      action_json: typeof action_json === 'string' ? action_json : JSON.stringify(action_json),
      is_active: true,
      created_by: req.user?.name || 'Aarav Sharma',
      created_at: new Date().toISOString()
    });

    res.status(201).json(rule);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create automation rule.' });
  }
});

// ─── PUT /api/automations/:id/toggle ─────────────────────────────────
router.put('/:id/toggle', requireAuth, async (req, res) => {
  try {
    const snapshot = await crmStore.snapshot();
    const rule = (snapshot.automations || []).find(r => Number(r.id) === Number(req.params.id));
    if (!rule) return res.status(404).json({ error: 'Automation rule not found.' });

    const updated = await crmStore.update('automations', req.params.id, {
      is_active: !rule.is_active
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle automation rule.' });
  }
});

// ─── POST /api/automations/:id/test (Dry-Run Test) ──────────────────
router.post('/:id/test', requireAuth, async (req, res) => {
  try {
    const result = await testAutomationRule(req.params.id, req.body || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to test automation rule.' });
  }
});

// ─── GET /api/automations/settings ──────────────────────────────────
router.get('/settings', requireAuth, async (req, res) => {
  try {
    const settings = await getAutomationSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch automation settings.' });
  }
});

// ─── PUT /api/automations/settings ──────────────────────────────────
router.put('/settings', requireAuth, async (req, res) => {
  try {
    const snapshot = await crmStore.snapshot();
    const current = snapshot.automation_settings || {};
    const updated = { ...current, ...req.body };
    
    // Save to memory snapshot & db if available
    snapshot.automation_settings = updated;
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update automation settings.' });
  }
});

// ─── POST /api/automations/run-cron (Secured Cron Trigger) ──────────
router.post('/run-cron', async (req, res) => {
  const secretKey = req.query.key || req.headers['x-cron-secret'];
  const expectedSecret = process.env.CRON_SECRET || 'smartpay-cron-secret';
  
  if (secretKey !== expectedSecret && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized cron execution' });
  }

  const result = await runDailyAutomationJob();
  res.json(result);
});

module.exports = router;
