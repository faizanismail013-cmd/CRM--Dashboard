/**
 * SmartPay CRM — Quotations Routes
 * CRUD for quotations with line items, PDF generation, and email sending
 */

const express = require('express');
const router = express.Router();
const { requireAuth, rbacFilter } = require('../middleware/auth');
const crmStore = require('../crm-store');
const { triggerAutomation, getAutomationSettings } = require('../services/automationService');

// Helper: Generate unique quotation number
function generateQuotationNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `QTN-${year}-${seq}`;
}

// Helper: Recalculate totals (5-Stage GST Precision)
function calculateTotals(items, discountPercent = 0, taxPercent = 18) {
  const subtotal = items.reduce((sum, item) => {
    const lineTotal = (item.quantity || 1) * (item.unit_price || 0);
    const lineDiscount = lineTotal * ((item.discount_percent || 0) / 100);
    return sum + (lineTotal - lineDiscount);
  }, 0);

  const roundedSubtotal = Math.round(subtotal);
  const discountAmount = Math.round(roundedSubtotal * (discountPercent / 100));
  const taxableValue = Math.max(0, roundedSubtotal - discountAmount);
  const taxAmount = Math.round(taxableValue * (taxPercent / 100));
  const total = taxableValue + taxAmount;

  return { subtotal: roundedSubtotal, discount_amount: discountAmount, taxable_value: taxableValue, tax_amount: taxAmount, total };
}

// ─── List Quotations ────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 25, status = '', company_id = '' } = req.query;
    const filters = {};
    if (status && status !== 'all') filters.status = status;
    if (company_id && company_id !== 'all') filters.company_id = Number(company_id);

    const result = await crmStore.listPaginated('quotations', {
      page: Number(page),
      limit: Number(limit),
      filters,
      sort: 'id',
      order: 'desc'
    });

    // Enrich with company / contact names from snapshot
    const snapshot = await crmStore.snapshot();
    result.data = result.data.map(q => {
      const company = snapshot.companies.find(c => c.id === q.company_id);
      const contact = snapshot.contacts.find(c => c.id === q.contact_id);
      const deal = snapshot.deals.find(d => d.id === q.deal_id);
      return {
        ...q,
        company_name: company?.name || '—',
        contact_name: contact?.name || '—',
        deal_title: deal?.title || '—'
      };
    });

    res.json(result);
  } catch (error) { next(error); }
});

// ─── Get Single Quotation with Line Items ───────────────────────────

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const quotation = await crmStore.findById('quotations', req.params.id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });

    // Get line items
    const allItems = await crmStore.list('quotation_items');
    const items = allItems.filter(i => Number(i.quotation_id) === Number(req.params.id));

    // Enrich
    const snapshot = await crmStore.snapshot();
    const company = snapshot.companies.find(c => c.id === quotation.company_id);
    const contact = snapshot.contacts.find(c => c.id === quotation.contact_id);
    const deal = snapshot.deals.find(d => d.id === quotation.deal_id);

    res.json({
      ...quotation,
      company_name: company?.name || '—',
      contact_name: contact?.name || '—',
      contact_email: contact?.email || '',
      deal_title: deal?.title || '—',
      items
    });
  } catch (error) { next(error); }
});

const crypto = require('crypto');

// ─── List Quotation Versions ────────────────────────────────────────
router.get('/:id/versions', requireAuth, async (req, res, next) => {
  try {
    const versions = await crmStore.list('quotation_versions');
    const filtered = versions.filter(v => Number(v.quotation_id) === Number(req.params.id));
    res.json({ success: true, versions: filtered });
  } catch (error) { next(error); }
});

// ─── Create Quotation with Line Items ───────────────────────────────

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      deal_id, company_id, contact_id, status = 'draft',
      valid_until, discount_percent = 0, tax_percent = 18,
      notes, terms, items = []
    } = req.body;

    if (!company_id) return res.status(400).json({ error: 'Company is required' });
    if (!items.length) return res.status(400).json({ error: 'At least one line item is required' });

    const userId = req.user?.id || null;
    const quotation_number = generateQuotationNumber();
    const public_token = crypto.randomBytes(16).toString('hex');

    // Calculate totals
    const { subtotal, total } = calculateTotals(items, Number(discount_percent), Number(tax_percent));

    const settings = await getAutomationSettings();
    let initialStatus = status;
    const requiresDiscountApproval = Number(discount_percent) > Number(settings.discount_approval_percent || 15);
    if (requiresDiscountApproval && status !== 'approved') {
      initialStatus = 'pending_approval';
    }

    const quotation = await crmStore.create('quotations', {
      quotation_number,
      public_token,
      version: 1,
      deal_id: deal_id ? Number(deal_id) : null,
      company_id: Number(company_id),
      contact_id: contact_id ? Number(contact_id) : null,
      status: initialStatus,
      valid_until: valid_until || null,
      subtotal,
      discount_percent: Number(discount_percent),
      tax_percent: Number(tax_percent),
      total,
      notes: notes || null,
      terms: terms || 'Net 30 days from acceptance',
      user_id: userId
    });

    if (requiresDiscountApproval && initialStatus === 'pending_approval') {
      await crmStore.create('approvals', {
        type: 'Quotation Discount Approval',
        entity_type: 'quotation',
        entity_id: quotation.id,
        requested_by: userId || 1,
        requester_name: req.user?.name || 'Sales Rep',
        approver_name: 'Sales Manager',
        status: 'Pending',
        old_value: '0%',
        new_value: `${discount_percent}%`,
        comments: `Discount of ${discount_percent}% requested for quotation ${quotation_number} (Exceeds ${settings.discount_approval_percent}% threshold)`,
        created_at: new Date().toISOString()
      });
    }

    // Trigger automation event
    const snapshotComp = await crmStore.snapshot();
    const companyObj = snapshotComp.companies.find(c => c.id === Number(company_id));
    await triggerAutomation('quotation_created', 'quotation', quotation.id, {
      company_name: companyObj ? companyObj.name : 'Customer',
      company_id: Number(company_id),
      quotation_number,
      total,
      discount_percent: Number(discount_percent),
      owner: req.user?.name || 'Aarav Sharma'
    });

    // Create line items
    const savedItems = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const lineTotal = (item.quantity || 1) * (item.unit_price || 0);
      const lineDiscount = lineTotal * ((item.discount_percent || 0) / 100);

      const saved = await crmStore.create('quotation_items', {
        quotation_id: quotation.id,
        product_id: item.product_id || null,
        description: item.description || '',
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        discount_percent: Number(item.discount_percent) || 0,
        total: Math.round(lineTotal - lineDiscount),
        sort_order: i + 1
      });
      savedItems.push(saved);
    }

    // Log initial version
    await crmStore.create('quotation_versions', {
      quotation_id: quotation.id,
      version: 1,
      subtotal,
      discount_amount: Math.round(subtotal * (discount_percent / 100)),
      tax_amount: Math.round((subtotal - (subtotal * (discount_percent / 100))) * (tax_percent / 100)),
      total,
      items_json: JSON.stringify(savedItems),
      created_by: req.user?.username || 'user'
    });

    // Log activity
    await crmStore.create('activities', {
      type: 'quotation',
      icon: '📋',
      text: `<strong>Quotation ${quotation_number} created</strong> · ₹${(total / 100000).toFixed(1)}L`,
      time: 'Just now',
      user_id: userId
    });

    res.status(201).json({ ...quotation, items: savedItems });
  } catch (error) { next(error); }
});

// ─── Update Quotation ───────────────────────────────────────────────

router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await crmStore.findById('quotations', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Quotation not found' });

    // Versioning snapshot if quote was already sent/viewed
    if ((existing.status || '').toLowerCase() !== 'draft') {
      const currentVersion = Number(existing.version || 1);
      const allItems = await crmStore.list('quotation_items');
      const oldItems = allItems.filter(i => Number(i.quotation_id) === Number(req.params.id));

      await crmStore.create('quotation_versions', {
        quotation_id: existing.id,
        version: currentVersion,
        subtotal: existing.subtotal || 0,
        total: existing.total || 0,
        items_json: JSON.stringify(oldItems),
        created_by: req.user?.username || 'user'
      });

      req.body.version = currentVersion + 1;
    }

    const allowed = ['deal_id', 'company_id', 'contact_id', 'status', 'valid_until',
                     'discount_percent', 'tax_percent', 'notes', 'terms', 'version'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    // If items are provided, recalculate and re-save
    if (req.body.items && Array.isArray(req.body.items)) {
      const items = req.body.items;
      const dp = Number(updates.discount_percent ?? existing.discount_percent ?? 0);
      const tp = Number(updates.tax_percent ?? existing.tax_percent ?? 18);
      const { subtotal, total } = calculateTotals(items, dp, tp);
      updates.subtotal = subtotal;
      updates.total = total;

      // Delete old items and insert new
      const allItems = await crmStore.list('quotation_items');
      const oldItems = allItems.filter(i => Number(i.quotation_id) === Number(req.params.id));
      for (const old of oldItems) {
        await crmStore.remove('quotation_items', old.id);
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const lineTotal = (item.quantity || 1) * (item.unit_price || 0);
        const lineDiscount = lineTotal * ((item.discount_percent || 0) / 100);
        await crmStore.create('quotation_items', {
          quotation_id: Number(req.params.id),
          product_id: item.product_id || null,
          description: item.description || '',
          quantity: Number(item.quantity) || 1,
          unit_price: Number(item.unit_price) || 0,
          discount_percent: Number(item.discount_percent) || 0,
          total: Math.round(lineTotal - lineDiscount),
          sort_order: i + 1
        });
      }
    }

    const quotation = await crmStore.update('quotations', req.params.id, updates);
    res.json(quotation);
  } catch (error) { next(error); }
});

// ─── Update Quotation Status ────────────────────────────────────────

router.put('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['draft', 'sent', 'viewed', 'under negotiation', 'negotiation', 'accepted', 'rejected', 'expired', 'cancelled'];
    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const quotation = await crmStore.update('quotations', req.params.id, { status });
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });

    const userId = req.user?.id || null;
    await crmStore.create('activities', {
      type: 'quotation',
      icon: '📋',
      text: `<strong>Quotation ${quotation.quotation_number}</strong> marked as <strong>${status}</strong>`,
      time: 'Just now',
      user_id: userId
    });

    res.json(quotation);
  } catch (error) { next(error); }
});

// ─── Delete Quotation ───────────────────────────────────────────────

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    // Delete line items first
    const allItems = await crmStore.list('quotation_items');
    const items = allItems.filter(i => Number(i.quotation_id) === Number(req.params.id));
    for (const item of items) {
      await crmStore.remove('quotation_items', item.id);
    }

    const deleted = await crmStore.remove('quotations', req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Quotation not found' });
    res.json({ success: true, message: 'Quotation deleted' });
  } catch (error) { next(error); }
});

module.exports = router;
