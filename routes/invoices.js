/**
 * SmartPay CRM — Invoices Routes
 * Full invoice lifecycle: creation with line items, payments ledger, GST calculations, and status automation.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crmStore = require('../crm-store');
const { sendLetterEmail, isValidEmail } = require('../services/mail');

// Helper: Generate unique invoice number
function generateInvoiceNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `INV-${year}-${seq}`;
}

// Helper: Generate unique payment number
function generatePaymentNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `PAY-${year}-${seq}`;
}

// Helper: Recalculate totals
function calculateTotals(items, discountPercent = 0, taxPercent = 18) {
  const subtotal = items.reduce((sum, item) => {
    const lineTotal = (item.quantity || 1) * (item.unit_price || 0);
    const lineDiscount = lineTotal * ((item.discount_percent || 0) / 100);
    return sum + (lineTotal - lineDiscount);
  }, 0);

  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * (taxPercent / 100);
  const total = Math.round(afterDiscount + taxAmount);

  return { subtotal: Math.round(subtotal), total };
}

// ─── List Invoices ──────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 25, status = '', company_id = '', search = '' } = req.query;
    const filters = {};
    if (status && status !== 'all') filters.status = status;
    if (company_id && company_id !== 'all') filters.company_id = Number(company_id);

    const result = await crmStore.listPaginated('invoices', {
      page: Number(page),
      limit: Number(limit),
      filters,
      search,
      searchFields: ['invoice_number', 'notes'],
      sort: 'id',
      order: 'desc'
    });

    const snapshot = await crmStore.snapshot();
    const today = new Date().toISOString().slice(0, 10);

    result.data = result.data.map(inv => {
      const company = snapshot.companies.find(c => c.id === inv.company_id);
      const contact = snapshot.contacts.find(c => c.id === inv.contact_id);
      const deal = snapshot.deals.find(d => d.id === inv.deal_id);
      const po = snapshot.purchase_orders?.find(p => p.id === inv.po_id);
      const quotation = snapshot.quotations?.find(q => q.id === inv.quotation_id);

      const amountPaid = Number(inv.amount_paid) || 0;
      const totalAmount = Number(inv.total) || 0;
      const balanceDue = Math.max(0, totalAmount - amountPaid);

      // Auto-flag overdue if past due date and not fully paid
      let currentStatus = inv.status;
      if (currentStatus !== 'paid' && currentStatus !== 'cancelled' && inv.due_date && inv.due_date < today) {
        currentStatus = 'overdue';
      }

      return {
        ...inv,
        status: currentStatus,
        balance_due: balanceDue,
        company_name: company?.name || '—',
        contact_name: contact?.name || '—',
        contact_email: contact?.email || '',
        deal_title: deal?.title || '—',
        po_number: po?.po_number || '—',
        quotation_number: quotation?.quotation_number || '—'
      };
    });

    res.json(result);
  } catch (error) { next(error); }
});

// ─── Get Single Invoice with Line Items & Payment History ───────────

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const invoice = await crmStore.findById('invoices', req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // Get line items
    const allItems = await crmStore.list('invoice_items');
    const items = allItems.filter(i => Number(i.invoice_id) === Number(req.params.id));

    // Get payment history
    const allPayments = await crmStore.list('payments');
    const payments = allPayments.filter(p => Number(p.invoice_id) === Number(req.params.id));

    // Enrich
    const snapshot = await crmStore.snapshot();
    const company = snapshot.companies.find(c => c.id === invoice.company_id);
    const contact = snapshot.contacts.find(c => c.id === invoice.contact_id);
    const deal = snapshot.deals.find(d => d.id === invoice.deal_id);
    const po = snapshot.purchase_orders?.find(p => p.id === invoice.po_id);
    const quotation = snapshot.quotations?.find(q => q.id === invoice.quotation_id);

    const amountPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalAmount = Number(invoice.total) || 0;
    const balanceDue = Math.max(0, totalAmount - amountPaid);

    res.json({
      ...invoice,
      amount_paid: amountPaid,
      balance_due: balanceDue,
      company_name: company?.name || '—',
      company_address: company?.address || '',
      company_gstin: company?.gstin || '',
      contact_name: contact?.name || '—',
      contact_email: contact?.email || '',
      deal_title: deal?.title || '—',
      po_number: po?.po_number || '—',
      quotation_number: quotation?.quotation_number || '—',
      items,
      payments
    });
  } catch (error) { next(error); }
});

// ─── Create Invoice with Line Items ─────────────────────────────────

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      po_id, quotation_id, deal_id, company_id, contact_id,
      status = 'sent', issue_date, due_date,
      discount_percent = 0, tax_percent = 18,
      notes, terms, items = []
    } = req.body;

    if (!company_id) return res.status(400).json({ error: 'Company is required' });
    if (!items.length) return res.status(400).json({ error: 'At least one line item is required' });

    const userId = req.user?.id || null;
    const invoice_number = generateInvoiceNumber();

    const todayStr = new Date().toISOString().slice(0, 10);
    const defaultDueDate = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);

    // Calculate totals
    const { subtotal, total } = calculateTotals(items, Number(discount_percent), Number(tax_percent));

    const invoice = await crmStore.create('invoices', {
      invoice_number,
      po_id: po_id ? Number(po_id) : null,
      quotation_id: quotation_id ? Number(quotation_id) : null,
      deal_id: deal_id ? Number(deal_id) : null,
      company_id: Number(company_id),
      contact_id: contact_id ? Number(contact_id) : null,
      status,
      issue_date: issue_date || todayStr,
      due_date: due_date || defaultDueDate,
      subtotal,
      discount_percent: Number(discount_percent),
      tax_percent: Number(tax_percent),
      total,
      amount_paid: 0,
      notes: notes || null,
      terms: terms || 'Net 15 days from issue date',
      user_id: userId
    });

    // Create line items
    const savedItems = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const lineTotal = (item.quantity || 1) * (item.unit_price || 0);
      const lineDiscount = lineTotal * ((item.discount_percent || 0) / 100);

      const saved = await crmStore.create('invoice_items', {
        invoice_id: invoice.id,
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

    // Log activity
    await crmStore.create('activities', {
      type: 'invoice',
      icon: '🧾',
      text: `<strong>Invoice ${invoice_number} created</strong> · ₹${(total / 100000).toFixed(1)}L`,
      time: 'Just now',
      user_id: userId
    });

    res.status(201).json({ ...invoice, items: savedItems });
  } catch (error) { next(error); }
});

// ─── Update Invoice ─────────────────────────────────────────────────

router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await crmStore.findById('invoices', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });

    const allowed = ['po_id', 'quotation_id', 'deal_id', 'company_id', 'contact_id',
                     'status', 'issue_date', 'due_date', 'discount_percent', 'tax_percent',
                     'notes', 'terms'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    // If items provided, recalculate
    if (req.body.items && Array.isArray(req.body.items)) {
      const items = req.body.items;
      const dp = Number(updates.discount_percent ?? existing.discount_percent ?? 0);
      const tp = Number(updates.tax_percent ?? existing.tax_percent ?? 18);
      const { subtotal, total } = calculateTotals(items, dp, tp);
      updates.subtotal = subtotal;
      updates.total = total;

      // Delete old items & create new
      const allItems = await crmStore.list('invoice_items');
      const oldItems = allItems.filter(i => Number(i.invoice_id) === Number(req.params.id));
      for (const old of oldItems) {
        await crmStore.remove('invoice_items', old.id);
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const lineTotal = (item.quantity || 1) * (item.unit_price || 0);
        const lineDiscount = lineTotal * ((item.discount_percent || 0) / 100);
        await crmStore.create('invoice_items', {
          invoice_id: Number(req.params.id),
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

    const updated = await crmStore.update('invoices', req.params.id, updates);
    res.json(updated);
  } catch (error) { next(error); }
});

// ─── Record Payment for Invoice ─────────────────────────────────────

router.post('/:id/payments', requireAuth, async (req, res, next) => {
  try {
    const invoice = await crmStore.findById('invoices', req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const {
      amount, payment_date, payment_method = 'bank_transfer',
      reference_number = '', notes = ''
    } = req.body;

    const paymentAmount = Number(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount is required' });
    }

    const userId = req.user?.id || null;
    const payment_number = generatePaymentNumber();
    const todayStr = new Date().toISOString().slice(0, 10);

    // 1. Create payment record
    const payment = await crmStore.create('payments', {
      payment_number,
      invoice_id: Number(req.params.id),
      company_id: invoice.company_id,
      amount: paymentAmount,
      payment_date: payment_date || todayStr,
      payment_method,
      reference_number: reference_number.trim(),
      notes: notes.trim(),
      user_id: userId
    });

    // 2. Compute new total paid
    const allPayments = await crmStore.list('payments');
    const invoicePayments = allPayments.filter(p => Number(p.invoice_id) === Number(req.params.id));
    const totalPaid = invoicePayments.reduce((sum, p) => sum + Number(p.amount), 0);

    // 3. Update invoice amount_paid and status
    let newStatus = invoice.status;
    if (totalPaid >= Number(invoice.total)) {
      newStatus = 'paid';
    } else if (totalPaid > 0) {
      newStatus = 'partial';
    }

    const updatedInvoice = await crmStore.update('invoices', req.params.id, {
      amount_paid: totalPaid,
      status: newStatus
    });

    // 4. Log CRM activity
    await crmStore.create('activities', {
      type: 'payment',
      icon: '💰',
      text: `<strong>Payment of ₹${(paymentAmount / 100000).toFixed(1)}L received</strong> for Invoice ${invoice.invoice_number} via ${payment_method.toUpperCase()}`,
      time: 'Just now',
      user_id: userId
    });

    res.status(201).json({
      success: true,
      payment,
      invoice: updatedInvoice,
      total_paid: totalPaid,
      balance_due: Math.max(0, Number(invoice.total) - totalPaid)
    });
  } catch (error) { next(error); }
});

// ─── Send Invoice via Email ─────────────────────────────────────────

router.post('/:id/send', requireAuth, async (req, res, next) => {
  try {
    const invoice = await crmStore.findById('invoices', req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const snapshot = await crmStore.snapshot();
    const company = snapshot.companies.find(c => c.id === invoice.company_id);
    const contact = snapshot.contacts.find(c => c.id === invoice.contact_id);

    const recipientEmail = req.body.to || contact?.email;
    if (!recipientEmail || !isValidEmail(recipientEmail)) {
      return res.status(400).json({ error: 'Valid recipient email is required' });
    }

    const allItems = await crmStore.list('invoice_items');
    const items = allItems.filter(i => Number(i.invoice_id) === Number(req.params.id));

    // Construct clean email HTML
    const itemsHtml = items.map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 14px;">${item.description}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 14px; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 14px; text-align: right;">₹${Number(item.unit_price).toLocaleString('en-IN')}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 14px; text-align: right; font-weight: 600;">₹${Number(item.total).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');

    const emailHtml = `
      <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 640px; margin: 0 auto; padding: 32px 24px; color: #1e293b; background: #ffffff;">
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px;">
          <div>
            <h1 style="font-size: 22px; font-weight: 800; color: #0B2A5E; margin: 0;">SmartPay Technologies</h1>
            <p style="font-size: 13px; color: #64748b; margin: 4px 0 0 0;">Next-Gen Enterprise Payment Infrastructure</p>
          </div>
          <div style="text-align: right;">
            <span style="display: inline-block; padding: 4px 10px; background: #eff6ff; color: #2563eb; border-radius: 6px; font-size: 12px; font-weight: 700;">TAX INVOICE</span>
            <p style="font-size: 14px; font-weight: 700; color: #0f172a; margin: 4px 0 0 0;">${invoice.invoice_number}</p>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 13px;">
          <div>
            <strong style="color: #64748b; text-transform: uppercase; font-size: 11px;">Billed To:</strong><br>
            <strong style="font-size: 15px; color: #0f172a;">${company?.name || 'Customer'}</strong><br>
            Attn: ${contact?.name || 'Finance Team'}<br>
            ${company?.address || ''}
          </div>
          <div style="text-align: right;">
            <strong>Issue Date:</strong> ${invoice.issue_date || '—'}<br>
            <strong>Due Date:</strong> ${invoice.due_date || '—'}<br>
            <strong>Payment Terms:</strong> ${invoice.terms || 'Net 15 days'}
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr style="background: #f8fafc;">
              <th style="padding: 10px; text-align: left; font-size: 12px; color: #64748b;">ITEM</th>
              <th style="padding: 10px; text-align: center; font-size: 12px; color: #64748b;">QTY</th>
              <th style="padding: 10px; text-align: right; font-size: 12px; color: #64748b;">UNIT PRICE</th>
              <th style="padding: 10px; text-align: right; font-size: 12px; color: #64748b;">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div style="text-align: right; margin-bottom: 24px; font-size: 14px;">
          <p style="margin: 4px 0;">Subtotal: <strong>₹${Number(invoice.subtotal).toLocaleString('en-IN')}</strong></p>
          ${invoice.discount_percent ? `<p style="margin: 4px 0; color: #16a34a;">Discount (${invoice.discount_percent}%): <strong>-₹${Math.round(invoice.subtotal * (invoice.discount_percent / 100)).toLocaleString('en-IN')}</strong></p>` : ''}
          <p style="margin: 4px 0;">GST (18%): <strong>₹${Math.round((invoice.subtotal * (1 - (invoice.discount_percent || 0)/100)) * 0.18).toLocaleString('en-IN')}</strong></p>
          <p style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 12px 0 0 0; padding-top: 8px; border-top: 1px solid #e2e8f0;">Total Due: ₹${Number(invoice.total).toLocaleString('en-IN')}</p>
        </div>

        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 24px; font-size: 13px;">
          <strong style="color: #0f172a;">Bank Transfer Details:</strong><br>
          Bank: HDFC Bank Ltd | A/C: 50200084920192 | IFSC: HDFC0000060 | Beneficiary: SmartPay Technologies Pvt Ltd
        </div>

        <p style="font-size: 12px; color: #94a3b8; text-align: center;">Thank you for your business. For billing queries, contact billing@smartpay.in</p>
      </div>
    `;

    const sendResult = await sendLetterEmail({
      to: recipientEmail,
      subject: `Tax Invoice ${invoice.invoice_number} from SmartPay Technologies`,
      html: emailHtml
    });

    // Update status to 'sent' if it was 'draft'
    if (invoice.status === 'draft') {
      await crmStore.update('invoices', invoice.id, { status: 'sent' });
    }

    // Log CRM activity
    const userId = req.user?.id || null;
    await crmStore.create('activities', {
      type: 'email',
      icon: '✉',
      text: `<strong>Sent Invoice ${invoice.invoice_number}</strong> to ${recipientEmail}`,
      time: 'Just now',
      user_id: userId
    });

    res.json({
      success: true,
      message: `Invoice ${invoice.invoice_number} sent to ${recipientEmail}`,
      provider: sendResult.provider,
      messageId: sendResult.messageId
    });
  } catch (error) { next(error); }
});

// ─── Delete Invoice ─────────────────────────────────────────────────

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const allItems = await crmStore.list('invoice_items');
    const items = allItems.filter(i => Number(i.invoice_id) === Number(req.params.id));
    for (const item of items) {
      await crmStore.remove('invoice_items', item.id);
    }

    const deleted = await crmStore.remove('invoices', req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (error) { next(error); }
});

module.exports = router;
