/**
 * SmartPay CRM — Renewal Management Route Module
 * Handles Contract Renewals, Status Updates, and Reminder Schedule Calculations.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crmStore = require('../crm-store');

// ─── GET /api/renewals (Paginated List) ─────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const status = String(req.query.status || 'all').trim();
    const search = String(req.query.search || '').trim().toLowerCase();
    const snapshot = await crmStore.snapshot();
    let renewals = snapshot.renewals || [];

    if (status !== 'all') {
      renewals = renewals.filter(r => (r.status || '').toLowerCase() === status.toLowerCase());
    }

    if (search) {
      renewals = renewals.filter(r =>
        `${r.company_name || ''} ${r.product_name || ''} ${r.owner || ''} ${r.notes || ''}`
          .toLowerCase()
          .includes(search)
      );
    }

    // Attach days remaining to renewal calculation
    const now = new Date();
    renewals = renewals.map(r => {
      const renDate = new Date(r.renewal_date);
      const diffDays = Math.ceil((renDate - now) / (1000 * 60 * 60 * 24));
      return { ...r, days_remaining: diffDays };
    });

    res.json({ data: renewals, total: renewals.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve renewals.' });
  }
});

// ─── POST /api/renewals (Create Renewal) ────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { company_id, company_name, product_id, product_name, contract_start, contract_end, renewal_date, value = 0, owner = 'Aarav Sharma', notes = '' } = req.body;
    if (!renewal_date) return res.status(400).json({ error: 'Renewal date is required.' });

    const newRenewal = await crmStore.create('renewals', {
      company_id: Number(company_id) || null,
      company_name: String(company_name || 'Customer').trim(),
      product_id: Number(product_id) || null,
      product_name: String(product_name || 'Service Contract').trim(),
      contract_start: contract_start || null,
      contract_end: contract_end || null,
      renewal_date,
      value: Number(value) || 0,
      owner,
      status: 'Upcoming',
      notes: String(notes).trim(),
      created_at: new Date().toISOString()
    });

    res.status(201).json(newRenewal);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create renewal record.' });
  }
});

// ─── PUT /api/renewals/:id (Update Status) ─────────────────────────
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const updated = await crmStore.update('renewals', req.params.id, {
      ...req.body,
      updated_at: new Date().toISOString()
    });
    if (!updated) return res.status(404).json({ error: 'Renewal record not found.' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update renewal record.' });
  }
});

module.exports = router;
