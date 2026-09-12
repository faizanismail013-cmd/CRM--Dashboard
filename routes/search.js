/**
 * SmartPay CRM — Global Multi-Entity Search Route Module
 * Searches across Companies, Contacts, Leads, Deals, Quotations, Tasks, Documents, Purchase Orders.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crmStore = require('../crm-store');

router.get('/', requireAuth, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q || q.length < 2) {
      return res.json({
        query: q,
        results: { companies: [], contacts: [], leads: [], deals: [], quotations: [], tasks: [], purchase_orders: [], documents: [] }
      });
    }

    const snapshot = await crmStore.snapshot();

    const companies = (snapshot.companies || [])
      .filter(c => `${c.name || ''} ${c.industry || ''} ${c.city || ''}`.toLowerCase().includes(q))
      .slice(0, 5);

    const contacts = (snapshot.contacts || [])
      .filter(c => `${c.name || ''} ${c.email || ''} ${c.company_name || ''} ${c.title || ''}`.toLowerCase().includes(q))
      .slice(0, 5);

    const leads = (snapshot.leads || [])
      .filter(l => `${l.name || ''} ${l.company || ''} ${l.email || ''} ${l.source || ''}`.toLowerCase().includes(q))
      .slice(0, 5);

    const deals = (snapshot.deals || [])
      .filter(d => `${d.title || ''} ${d.company || ''} ${d.stage || ''}`.toLowerCase().includes(q))
      .slice(0, 5);

    const quotations = (snapshot.quotations || [])
      .filter(qtn => `${qtn.quotation_number || ''} ${qtn.company_name || ''} ${qtn.notes || ''}`.toLowerCase().includes(q))
      .slice(0, 5);

    const tasks = (snapshot.tasks || [])
      .filter(t => `${t.title || ''} ${t.company || ''} ${t.assignee || ''}`.toLowerCase().includes(q))
      .slice(0, 5);

    const purchase_orders = (snapshot.purchase_orders || [])
      .filter(po => `${po.po_number || ''} ${po.company_name || ''}`.toLowerCase().includes(q))
      .slice(0, 5);

    const documents = (snapshot.documents || [])
      .filter(doc => `${doc.name || ''} ${doc.type || ''}`.toLowerCase().includes(q))
      .slice(0, 5);

    res.json({
      query: q,
      results: {
        companies,
        contacts,
        leads,
        deals,
        quotations,
        tasks,
        purchase_orders,
        documents
      }
    });
  } catch (error) {
    console.error('Global search error:', error.message);
    res.status(500).json({ error: 'Global search failed.' });
  }
});

module.exports = router;
