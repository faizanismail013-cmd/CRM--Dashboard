/**
 * SmartPay CRM — Renewal Management Route Module
 * Handles Contract Renewals, Status Updates, and Reminder Schedule Calculations.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crmStore = require('../crm-store');
const { sendLetterEmail, isValidEmail } = require('../services/mail');


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

// ─── POST /api/renewals/:id/send-reminder ───────────────────────────
router.post('/:id/send-reminder', requireAuth, async (req, res) => {
  try {
    const renewal = await crmStore.findById('renewals', req.params.id);
    if (!renewal) return res.status(404).json({ error: 'Renewal record not found.' });

    const snapshot = await crmStore.snapshot();
    const company = (snapshot.companies || []).find(c => Number(c.id) === Number(renewal.company_id) || c.name === renewal.company_name);
    const contact = (snapshot.contacts || []).find(cnt => Number(cnt.company_id) === Number(renewal.company_id) || cnt.company_name === renewal.company_name);

    const recipientEmail = (req.body.to || contact?.email || company?.email || '').trim();
    if (!recipientEmail || (typeof isValidEmail === 'function' && !isValidEmail(recipientEmail))) {
      return res.status(400).json({ error: 'No valid customer email address configured for this renewal.' });
    }

    const subject = req.body.subject || `Contract Renewal Reminder: ${renewal.product_name || 'Service Contract'} (${renewal.company_name || 'Customer'})`;
    const bodyText = req.body.body || `Dear ${company?.name || 'Customer'},\n\nThis is a reminder that your contract for ${renewal.product_name || 'Service Contract'} is scheduled for renewal on ${renewal.renewal_date || 'the upcoming due date'}.\n\nBest regards,\nSmartPay Sales & Support Team`;

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; color: #1e293b; background: #ffffff;">
        <div style="border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px;">
          <h1 style="margin: 0; color: #1e40af; font-size: 24px; font-weight: 800;">SmartPay CRM</h1>
          <p style="margin: 2px 0 0 0; color: #64748b; font-size: 12px;">Contract Lifecycle & Renewal Management Notice</p>
        </div>
        <div style="white-space: pre-wrap; line-height: 1.6; font-size: 14px; color: #334155; margin-bottom: 24px;">${bodyText}</div>
        <div style="background: #f8fafc; border-radius: 8px; padding: 14px; font-size: 13px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
          <strong>Contract Summary:</strong><br>
          Product / Service: <strong>${renewal.product_name || 'Contract'}</strong><br>
          Account: <strong>${renewal.company_name || 'Customer'}</strong><br>
          Scheduled Renewal Date: <strong>${renewal.renewal_date || '—'}</strong><br>
          Annual Contract Value: <strong>₹${Number(renewal.value || 0).toLocaleString('en-IN')}</strong>
        </div>
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">Thank you for partnering with SmartPay Technologies.</p>
      </div>
    `;

    // Dispatch real email
    let sendResult;
    try {
      sendResult = await sendLetterEmail({
        to: recipientEmail,
        subject,
        html: emailHtml
      });
    } catch (mailErr) {
      console.error('⚠️  Failed to send real renewal reminder email:', mailErr.message);
      return res.status(500).json({ error: `Failed to send email: ${mailErr.message}` });
    }

    const nowIso = new Date().toISOString();
    const updated = await crmStore.update('renewals', req.params.id, {
      last_reminder_sent_at: nowIso,
      updated_at: nowIso
    });

    const userId = req.user?.id || 1;
    await crmStore.create('activities', {
      type: 'renewal',
      icon: '🔔',
      text: `<strong>Renewal Reminder</strong> for ${renewal.product_name || 'Contract'} sent to <strong>${recipientEmail}</strong> (${sendResult?.provider || 'email'})`,
      time: 'Just now',
      user_id: userId
    });

    await crmStore.create('communications', {
      type: 'email',
      recipient: recipientEmail,
      cc: req.body.cc || '',
      subject,
      body_html: emailHtml,
      status: 'sent',
      entity_type: 'renewal',
      entity_id: renewal.id,
      user_id: userId,
      created_at: nowIso
    });

    res.json({
      success: true,
      message: `Renewal reminder sent successfully to ${recipientEmail} (${sendResult?.provider || 'email'})`,
      renewal: updated
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send renewal reminder.' });
  }
});

module.exports = router;


