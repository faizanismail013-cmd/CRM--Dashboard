const express = require('express');
const router = express.Router();
const store = require('../crm-store');
const { triggerAutomation } = require('../services/automationService');
const { createAuditLog } = require('../db');

// ─── GET /api/public/quotations/:token ────────────────────────────────
router.get('/quotations/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const quotations = await store.list('quotations');
    const quote = quotations.find(q => q.public_token === token);

    if (!quote) {
      return res.status(404).json({ error: 'Quotation not found or link has expired.' });
    }

    // Automatically transition status from 'sent' to 'viewed'
    if ((quote.status || '').toLowerCase() === 'sent') {
      await store.update('quotations', quote.id, { status: 'viewed' });
      try {
        await createAuditLog(1, 'Quotation Viewed', 'quotation', quote.id, { status: 'viewed' }, req.ip);
        await triggerAutomation('quotation_viewed', 'quotation', quote.id, {
          company_name: quote.company_name,
          company_id: quote.company_id,
          quotation_number: quote.quotation_number,
          owner: quote.created_by || 'Aarav Sharma'
        });
      } catch (e) {}
    }

    const companies = await store.list('companies');
    const company = companies.find(c => c.id === quote.company_id);

    res.json({
      success: true,
      quotation: {
        id: quote.id,
        public_token: quote.public_token,
        quotation_number: quote.quotation_number,
        company_name: company ? company.name : (quote.company_name || 'Client'),
        valid_until: quote.valid_until,
        subtotal: quote.subtotal || 0,
        discount_percent: quote.discount_percent || 0,
        tax_percent: quote.tax_percent || 18,
        total: quote.total || 0,
        status: quote.status,
        notes: quote.notes,
        terms: quote.terms,
        items: quote.items || []
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/public/quotations/:token/accept ──────────────────────
router.post('/quotations/:token/accept', async (req, res) => {
  try {
    const { token } = req.params;
    const quotations = await store.list('quotations');
    const quote = quotations.find(q => q.public_token === token);

    if (!quote) {
      return res.status(404).json({ error: 'Quotation not found.' });
    }

    const updated = await store.update('quotations', quote.id, {
      status: 'accepted',
      accepted_at: new Date().toISOString()
    });

    // Update linked deal stage if present
    if (quote.deal_id) {
      await store.update('deals', quote.deal_id, {
        stage: 'Won',
        probability: 100
      });
    }

    try {
      await createAuditLog(1, 'Quotation Accepted', 'quotation', quote.id, { status: 'accepted' }, req.ip);
      await triggerAutomation('quotation_accepted', 'quotation', quote.id, {
        company_name: quote.company_name,
        company_id: quote.company_id,
        quotation_number: quote.quotation_number,
        total: quote.total,
        owner: quote.created_by || 'Aarav Sharma'
      });
    } catch (e) {}

    res.json({ success: true, message: 'Quotation accepted! Thank you.', quotation: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/public/quotations/:token/reject ──────────────────────
router.post('/quotations/:token/reject', async (req, res) => {
  try {
    const { token } = req.params;
    const { reason } = req.body;
    const quotations = await store.list('quotations');
    const quote = quotations.find(q => q.public_token === token);

    if (!quote) {
      return res.status(404).json({ error: 'Quotation not found.' });
    }

    const updated = await store.update('quotations', quote.id, {
      status: 'rejected',
      rejection_reason: reason || 'Customer requested changes',
      rejected_at: new Date().toISOString()
    });

    try {
      await createAuditLog(1, 'Quotation Rejected', 'quotation', quote.id, { status: 'rejected', reason }, req.ip);
      await triggerAutomation('quotation_rejected', 'quotation', quote.id, {
        company_name: quote.company_name,
        company_id: quote.company_id,
        quotation_number: quote.quotation_number,
        reason: reason || 'Customer requested changes',
        owner: quote.created_by || 'Aarav Sharma'
      });
    } catch (e) {}

    res.json({ success: true, message: 'Quotation rejection recorded.', quotation: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
