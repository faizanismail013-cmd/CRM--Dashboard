const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { createAuditLog } = require('../db');
const store = require('../crm-store');

// Helpers for validation
function isValidEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function isValidPhone(phone) {
  if (!phone) return true;
  return /^[+\d\s\-()]{7,20}$/.test(String(phone).trim());
}

function isValidGSTIN(gst) {
  if (!gst) return true;
  // Standard 15-character Indian GSTIN format
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(String(gst).trim().toUpperCase());
}

function generateCustomerId() {
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `CUS-2026-${seq}`;
}

// ─── POST /api/customers/check-duplicate ────────────────────────────
router.post('/check-duplicate', requireAuth, async (req, res, next) => {
  try {
    const { name = '', gst_number = '', email = '', phone = '' } = req.body;
    const companies = await store.list('companies');
    const contacts = await store.list('contacts');

    const cleanName = name.trim().toLowerCase();
    const cleanGst = gst_number.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.replace(/[^\d]/g, '');

    const duplicates = companies.filter(c => {
      const nameMatch = cleanName && c.name && c.name.toLowerCase() === cleanName;
      const gstMatch = cleanGst && c.gst_number && c.gst_number.toUpperCase() === cleanGst;
      const phoneMatch = cleanPhone && (
        (c.phone && c.phone.replace(/[^\d]/g, '') === cleanPhone) ||
        (c.alternate_phone && c.alternate_phone.replace(/[^\d]/g, '') === cleanPhone)
      );
      
      const companyContacts = contacts.filter(cnt => cnt.company_id === c.id || cnt.company_name === c.name);
      const emailMatch = cleanEmail && companyContacts.some(cnt => cnt.email && cnt.email.toLowerCase() === cleanEmail);

      return nameMatch || gstMatch || phoneMatch || emailMatch;
    });

    res.json({
      hasDuplicates: duplicates.length > 0,
      matches: duplicates.map(d => ({
        id: d.id,
        customer_id: d.customer_id || `CUS-2026-${String(d.id).padStart(4, '0')}`,
        name: d.name,
        gst_number: d.gst_number || '—',
        owner: d.owner || 'Aarav Sharma'
      }))
    });
  } catch (error) { next(error); }
});

// ─── GET /api/customers ─────────────────────────────────────────────
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 25, search = '', status = '', industry = '', owner = '', sort = 'name', order = 'asc' } = req.query;
    let companies = await store.list('companies');
    const snapshot = await store.snapshot();

    // Filtering & Searching
    const cleanSearch = search.toLowerCase().trim();
    const filtered = companies.filter(c => {
      const custStatus = c.customer_status || (c.status === 'lead' ? 'Prospect' : 'Active Customer');
      if (status && status !== 'all' && custStatus !== status) return false;
      if (industry && industry !== 'all' && c.industry !== industry) return false;
      if (owner && owner !== 'all' && c.owner !== owner) return false;

      if (cleanSearch) {
        const matchesName = (c.name || '').toLowerCase().includes(cleanSearch);
        const matchesId = (c.customer_id || '').toLowerCase().includes(cleanSearch);
        const matchesGst = (c.gst_number || '').toLowerCase().includes(cleanSearch);
        const matchesPhone = (c.phone || '').toLowerCase().includes(cleanSearch);
        return matchesName || matchesId || matchesGst || matchesPhone;
      }
      return true;
    });

    // Derive commercial metrics for each customer
    const enriched = filtered.map(c => {
      const cDeals = snapshot.deals.filter(d => d.company === c.name || d.company_id === c.id);
      const cInvoices = snapshot.invoices.filter(i => i.company_name === c.name || i.company_id === c.id);
      const cRenewals = snapshot.renewals.filter(r => r.company_name === c.name || r.company_id === c.id);
      const cContacts = snapshot.contacts.filter(cnt => cnt.company_name === c.name || cnt.company_id === c.id);
      const primaryContact = cContacts.find(cnt => cnt.primary || cnt.primary_contact) || cContacts[0] || {};

      const totalPurchases = cInvoices.reduce((s, i) => s + (Number(i.total) || 0), 0);
      const totalPaid = cInvoices.reduce((s, i) => s + (Number(i.amount_paid) || 0), 0);
      const outstanding = Math.max(0, totalPurchases - totalPaid);

      const latestInvoice = cInvoices.sort((a, b) => new Date(b.issue_date || 0) - new Date(a.issue_date || 0))[0];
      const nextRenewal = cRenewals.sort((a, b) => new Date(a.renewal_date || 0) - new Date(b.renewal_date || 0))[0];

      return {
        ...c,
        customer_id: c.customer_id || `CUS-2026-${String(c.id).padStart(4, '0')}`,
        customer_status: c.customer_status || (c.status === 'lead' ? 'Prospect' : 'Active Customer'),
        primary_contact: primaryContact.name || '—',
        phone: c.phone || primaryContact.phone || '—',
        email: primaryContact.email || '—',
        gst_number: c.gst_number || '—',
        location: [c.city, c.state, c.country].filter(Boolean).join(', ') || 'Bengaluru, India',
        total_purchases: totalPurchases,
        outstanding_amount: outstanding,
        last_purchase_date: latestInvoice ? latestInvoice.issue_date : '—',
        next_renewal_date: nextRenewal ? nextRenewal.renewal_date : '—'
      };
    });

    // Sorting
    enriched.sort((a, b) => {
      let valA = a[sort] ?? '';
      let valB = b[sort] ?? '';
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return order === 'asc' ? -1 : 1;
      if (valA > valB) return order === 'asc' ? 1 : -1;
      return 0;
    });

    const start = (Number(page) - 1) * Number(limit);
    const paginated = enriched.slice(start, start + Number(limit));

    res.json({
      success: true,
      total: enriched.length,
      page: Number(page),
      limit: Number(limit),
      data: paginated
    });
  } catch (error) { next(error); }
});

// ─── POST /api/customers ────────────────────────────────────────────
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      name, primary_contact_name, phone, email, gst_number, pan_number, website,
      industry = 'Fintech', customer_type = 'Enterprise', customer_status = 'Active Customer',
      billing_address, shipping_address, city = 'Bengaluru', state: st = 'Karnataka', country = 'India', pin_code = '560001',
      owner = 'Aarav Sharma', notes
    } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ error: 'Customer name is required.' });
    if (email && !isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address format.' });
    if (phone && !isValidPhone(phone)) return res.status(400).json({ error: 'Invalid phone number format.' });
    if (gst_number && !isValidGSTIN(gst_number)) return res.status(400).json({ error: 'Invalid Indian GSTIN format (e.g. 29ABCDE1234F1Z5).' });

    const customer_id = generateCustomerId();
    const public_token = crypto.randomBytes(16).toString('hex');
    const initial = name.trim()[0].toUpperCase();

    const created = await store.create('companies', {
      name: name.trim(),
      customer_id,
      public_token,
      initial,
      logo: 'purple-logo',
      industry,
      owner,
      status: customer_status === 'Prospect' ? 'lead' : 'active',
      customer_status,
      customer_type,
      gst_number: gst_number ? gst_number.toUpperCase().trim() : null,
      pan_number: pan_number ? pan_number.toUpperCase().trim() : null,
      website: website || null,
      phone: phone || null,
      billing_address: billing_address || null,
      shipping_address: shipping_address || null,
      city,
      state: st,
      country,
      pin_code,
      notes: notes || null,
      user_id: req.user?.id || null
    });

    // Create primary contact if specified
    if (primary_contact_name && primary_contact_name.trim()) {
      await store.create('contacts', {
        name: primary_contact_name.trim(),
        email: email || null,
        phone: phone || null,
        primary: true,
        primary_contact: true,
        company_id: created.id,
        company_name: created.name,
        contact_role: 'Primary Contact'
      });
    }

    try { await createAuditLog(req.user?.id || 1, 'Customer Created', 'company', created.id, { name: created.name, customer_id }, req.ip); } catch (e) {}

    res.status(201).json(created);
  } catch (error) { next(error); }
});

// ─── GET /api/customers/:id ─────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const companies = await store.list('companies');
    const company = companies.find(c => String(c.id) === String(id) || c.customer_id === id || c.public_token === id);

    if (!company) return res.status(404).json({ error: 'Customer not found.' });

    const snapshot = await store.snapshot();
    const cName = company.name;
    const cId = company.id;

    const contacts = snapshot.contacts.filter(c => c.company_id === cId || c.company_name === cName);
    const deals = snapshot.deals.filter(d => d.company_id === cId || d.company === cName);
    const quotations = snapshot.quotations.filter(q => q.company_id === cId || q.company_name === cName);
    const purchaseOrders = snapshot.purchase_orders.filter(p => p.company_id === cId || p.company_name === cName);
    const invoices = snapshot.invoices.filter(i => i.company_id === cId || i.company_name === cName);
    const payments = snapshot.payments.filter(p => invoices.map(i => i.id).includes(p.invoice_id));
    const activities = snapshot.activities.filter(a => a.company === cName || a.text?.includes(cName));
    const tasks = snapshot.tasks.filter(t => t.company === cName);
    const documents = snapshot.documents.filter(d => d.company_id === cId || d.company_name === cName);
    const communications = snapshot.communications.filter(c => c.company_id === cId || c.company_name === cName);
    const renewals = snapshot.renewals.filter(r => r.company_id === cId || r.company_name === cName);

    // Derived Purchases
    const derivedPurchases = [];
    invoices.forEach(inv => {
      (inv.items || [{ description: 'Payment Gateway License', quantity: 1, unit_price: inv.total || 0, total: inv.total || 0 }]).forEach(item => {
        derivedPurchases.push({
          id: `PUR-${inv.id}-${item.product_id || 1}`,
          product_name: item.description || 'Payment Gateway Solution',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || 0,
          discount_percent: item.discount_percent || 0,
          tax_amount: Math.round((item.total || 0) * 0.18),
          total_amount: item.total || 0,
          purchase_date: inv.issue_date || '2026-09-05',
          quotation_number: quotations[0]?.quotation_number || 'QTN-2026-001',
          po_number: purchaseOrders[0]?.po_number || 'PO-2026-001',
          invoice_number: inv.invoice_number || 'INV-2026-001',
          payment_status: inv.status === 'paid' ? 'Paid' : 'Pending'
        });
      });
    });

    const totalPurchases = invoices.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const totalPaid = invoices.reduce((s, i) => s + (Number(i.amount_paid) || 0), 0);
    const outstanding = Math.max(0, totalPurchases - totalPaid);

    res.json({
      success: true,
      customer: {
        ...company,
        customer_id: company.customer_id || `CUS-2026-${String(company.id).padStart(4, '0')}`,
        customer_status: company.customer_status || (company.status === 'lead' ? 'Prospect' : 'Active Customer'),
        total_purchases: totalPurchases,
        total_paid: totalPaid,
        outstanding_amount: outstanding,
        contacts,
        deals,
        quotations,
        purchaseOrders,
        invoices,
        payments,
        activities,
        tasks,
        documents,
        communications,
        renewals,
        derivedPurchases
      }
    });
  } catch (error) { next(error); }
});

// ─── PUT /api/customers/:id ─────────────────────────────────────────
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await store.findById('companies', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Customer not found.' });

    const { email, phone, gst_number } = req.body;
    if (email && !isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format.' });
    if (phone && !isValidPhone(phone)) return res.status(400).json({ error: 'Invalid phone number format.' });
    if (gst_number && !isValidGSTIN(gst_number)) return res.status(400).json({ error: 'Invalid Indian GSTIN format.' });

    const allowed = [
      'name', 'industry', 'owner', 'status', 'customer_status', 'customer_type',
      'gst_number', 'pan_number', 'website', 'phone', 'alternate_phone', 'alternate_email',
      'billing_address', 'shipping_address', 'city', 'state', 'country', 'pin_code', 'notes'
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const updated = await store.update('companies', req.params.id, updates);

    try { await createAuditLog(req.user?.id || 1, 'Customer Updated', 'company', updated.id, updates, req.ip); } catch (e) {}

    res.json(updated);
  } catch (error) { next(error); }
});

module.exports = router;
