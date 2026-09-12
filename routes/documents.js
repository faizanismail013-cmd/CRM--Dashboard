/**
 * SmartPay CRM — Document Repository Route Module
 * Universal Document metadata management and version control.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crmStore = require('../crm-store');

// ─── GET /api/documents ─────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const entityType = String(req.query.entity_type || '').trim();
    const entityId = Number(req.query.entity_id) || null;
    const snapshot = await crmStore.snapshot();
    let docs = snapshot.documents || [];

    if (entityType && entityId) {
      docs = docs.filter(d => d.entity_type === entityType && Number(d.entity_id) === entityId);
    }

    res.json({ data: docs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch documents.' });
  }
});

// ─── POST /api/documents ────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, type = 'Other', entity_type, entity_id, file_path = '/documents/sample.pdf', file_size = 102400 } = req.body;
    if (!name) return res.status(400).json({ error: 'Document name is required.' });

    const doc = await crmStore.create('documents', {
      name: String(name).trim(),
      type,
      entity_type,
      entity_id: Number(entity_id) || null,
      file_path,
      file_size: Number(file_size) || 0,
      version: 1,
      uploaded_by: req.user?.name || 'Aarav Sharma',
      created_at: new Date().toISOString()
    });

    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ error: 'Failed to register document.' });
  }
});

module.exports = router;
