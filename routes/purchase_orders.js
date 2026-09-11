/**
 * SmartPay CRM — Purchase Orders Routes
 * Manage customer purchase orders, link to quotations & deals, and bridge to invoicing.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crmStore = require('../crm-store');

// Helper: Generate PO number fallback
function generatePoNumber(companyName = 'CUST') {
  const now = new Date();
  const year = now.getFullYear();
  const tag = (companyName.replace(/[^A-Za-z]/g, '').slice(0, 3) || 'ORD').toUpperCase();
  const seq = String(Math.floor(Math.random() * 900) + 100);
  return `PO-${tag}-${year}-${seq}`;
}

// ─── List Purchase Orders ───────────────────────────────────────────

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 25, status = '', company_id = '', search = '' } = req.query;
    const filters = {};
    if (status && status !== 'all') filters.status = status;
    if (company_id && company_id !== 'all') filters.company_id = Number(company_id);

    const result = await crmStore.listPaginated('purchase_orders', {
      page: Number(page),
      limit: Number(limit),
      filters,
      search,
      searchFields: ['po_number', 'notes'],
      sort: 'id',
      order: 'desc'
    });

    const snapshot = await crmStore.snapshot();

    result.data = result.data.map(po => {
      const company = snapshot.companies.find(c => c.id === po.company_id);
      const deal = snapshot.deals.find(d => d.id === po.deal_id);
      const quotation = snapshot.quotations?.find(q => q.id === po.quotation_id);
      const invoice = snapshot.invoices?.find(inv => inv.po_id === po.id);

      return {
        ...po,
        company_name: company?.name || '—',
        deal_title: deal?.title || '—',
        quotation_number: quotation?.quotation_number || '—',
        invoice_number: invoice?.invoice_number || null
      };
    });

    res.json(result);
  } catch (error) { next(error); }
});

// ─── Get Single Purchase Order ──────────────────────────────────────

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const po = await crmStore.findById('purchase_orders', req.params.id);
    if (!po) return res.status(404).json({ error: 'Purchase Order not found' });

    const snapshot = await crmStore.snapshot();
    const company = snapshot.companies.find(c => c.id === po.company_id);
    const deal = snapshot.deals.find(d => d.id === po.deal_id);
    const quotation = snapshot.quotations?.find(q => q.id === po.quotation_id);
    const invoice = snapshot.invoices?.find(inv => inv.po_id === po.id);

    res.json({
      ...po,
      company_name: company?.name || '—',
      deal_title: deal?.title || '—',
      quotation_number: quotation?.quotation_number || '—',
      invoice_id: invoice?.id || null,
      invoice_number: invoice?.invoice_number || null
    });
  } catch (error) { next(error); }
});

// ─── Create Purchase Order ──────────────────────────────────────────

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      po_number, quotation_id, deal_id, company_id,
      amount, status = 'received', issue_date, delivery_date, notes
    } = req.body;

    if (!company_id) return res.status(400).json({ error: 'Company is required' });
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Valid amount is required' });

    const snapshot = await crmStore.snapshot();
    const company = snapshot.companies.find(c => c.id === Number(company_id));

    const finalPoNumber = po_number && String(po_number).trim()
      ? String(po_number).trim()
      : generatePoNumber(company?.name || 'ORD');

    const todayStr = new Date().toISOString().slice(0, 10);
    const userId = req.user?.id || null;

    const po = await crmStore.create('purchase_orders', {
      po_number: finalPoNumber,
      quotation_id: quotation_id ? Number(quotation_id) : null,
      deal_id: deal_id ? Number(deal_id) : null,
      company_id: Number(company_id),
      amount: Number(amount),
      status,
      issue_date: issue_date || todayStr,
      delivery_date: delivery_date || null,
      notes: notes || null,
      user_id: userId
    });

    // Log activity
    await crmStore.create('activities', {
      type: 'po',
      icon: '📦',
      text: `<strong>Purchase Order ${finalPoNumber} logged</strong> · ₹${(Number(amount) / 100000).toFixed(1)}L for ${company?.name || 'Customer'}`,
      time: 'Just now',
      user_id: userId
    });

    res.status(201).json(po);
  } catch (error) { next(error); }
});

// ─── Update Purchase Order ──────────────────────────────────────────

router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await crmStore.findById('purchase_orders', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Purchase Order not found' });

    const allowed = ['po_number', 'quotation_id', 'deal_id', 'company_id',
                     'amount', 'status', 'issue_date', 'delivery_date', 'notes'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }
    if (updates.amount !== undefined) updates.amount = Number(updates.amount);
    if (updates.company_id !== undefined) updates.company_id = Number(updates.company_id);
    if (updates.deal_id !== undefined) updates.deal_id = updates.deal_id ? Number(updates.deal_id) : null;
    if (updates.quotation_id !== undefined) updates.quotation_id = updates.quotation_id ? Number(updates.quotation_id) : null;

    const updated = await crmStore.update('purchase_orders', req.params.id, updates);
    res.json(updated);
  } catch (error) { next(error); }
});

// ─── Delete Purchase Order ──────────────────────────────────────────

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const deleted = await crmStore.remove('purchase_orders', req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Purchase Order not found' });
    res.json({ success: true, message: 'Purchase Order deleted' });
  } catch (error) { next(error); }
});

module.exports = router;
