/**
 * SmartPay CRM — Lead Management Route Module
 * Handles Lead CRUD, Scoring, Filters, Bulk Actions, CSV Import/Export,
 * and the Lead -> Company + Contact + Deal + Task Conversion Workflow.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crmStore = require('../crm-store');
const { triggerAutomation } = require('../services/automationService');

// ─── GET /api/leads (Paginated List & Filter) ────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 25));
    const search = String(req.query.search || '').trim().toLowerCase();
    const status = String(req.query.status || 'all').trim();
    const source = String(req.query.source || 'all').trim();
    const owner = String(req.query.owner || 'all').trim();
    const sortBy = String(req.query.sortBy || 'created_at').trim();
    const sortOrder = String(req.query.sortOrder || 'desc').trim();

    const snapshot = await crmStore.snapshot();
    let leads = snapshot.leads || [];

    if (status !== 'all') leads = leads.filter(l => (l.status || '').toLowerCase() === status.toLowerCase());
    if (source !== 'all') leads = leads.filter(l => (l.source || '').toLowerCase() === source.toLowerCase());
    if (owner !== 'all') leads = leads.filter(l => (l.owner || '').toLowerCase() === owner.toLowerCase());

    if (search) {
      leads = leads.filter(l =>
        `${l.name || ''} ${l.company || ''} ${l.contact_name || ''} ${l.email || ''} ${l.phone || ''} ${l.notes || ''}`
          .toLowerCase()
          .includes(search)
      );
    }

    leads.sort((a, b) => {
      let valA = a[sortBy] ?? '';
      let valB = b[sortBy] ?? '';
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const total = leads.length;
    const startIndex = (page - 1) * limit;
    const paginated = leads.slice(startIndex, startIndex + limit);

    res.json({
      data: paginated,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching leads:', error.message);
    res.status(500).json({ error: 'Failed to retrieve leads.' });
  }
});

// ─── GET /api/leads/:id (Lead Detail) ────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const lead = await crmStore.findById('leads', req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve lead detail.' });
  }
});

// ─── POST /api/leads (Create Lead) ───────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, company, contact_name, email, phone, source = 'Inbound', industry = 'General', owner = 'Aarav Sharma', expected_value = 0, next_followup, notes = '' } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Lead name is required.' });
    }

    // Auto Lead Scoring Logic
    let lead_score = 50;
    if (email && email.includes('@')) lead_score += 15;
    if (phone && phone.length > 6) lead_score += 10;
    if (Number(expected_value) >= 500000) lead_score += 15;
    if (source === 'Inbound' || source === 'Referral') lead_score += 10;

    const newLead = await crmStore.create('leads', {
      name: String(name).trim(),
      company: String(company || name).trim(),
      contact_name: String(contact_name || name).trim(),
      email: String(email || '').trim(),
      phone: String(phone || '').trim(),
      source,
      industry,
      owner,
      lead_score,
      status: 'New',
      expected_value: Number(expected_value) || 0,
      next_followup: next_followup || null,
      notes: String(notes).trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    try {
      await triggerAutomation('lead_created', 'lead', newLead.id, {
        company_name: newLead.company,
        owner: newLead.owner || 'Aarav Sharma'
      });
    } catch (e) {}

    res.status(201).json(newLead);
  } catch (error) {
    console.error('Error creating lead:', error.message);
    res.status(500).json({ error: 'Failed to create lead.' });
  }
});

// ─── PUT /api/leads/:id (Update Lead) ────────────────────────────────
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const updated = await crmStore.update('leads', req.params.id, {
      ...req.body,
      updated_at: new Date().toISOString()
    });
    if (!updated) return res.status(404).json({ error: 'Lead not found.' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update lead.' });
  }
});

// ─── DELETE /api/leads/:id ───────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await crmStore.remove('leads', req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Lead not found.' });
    res.json({ success: true, message: 'Lead removed successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete lead.' });
  }
});

// ─── POST /api/leads/bulk (Bulk Operations) ─────────────────────────
router.post('/bulk', requireAuth, async (req, res) => {
  try {
    const { ids = [], action, value } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No lead IDs provided for bulk operation.' });
    }

    let affected = 0;
    for (const id of ids) {
      if (action === 'update_status') {
        await crmStore.update('leads', id, { status: value, updated_at: new Date().toISOString() });
        affected++;
      } else if (action === 'reassign_owner') {
        await crmStore.update('leads', id, { owner: value, updated_at: new Date().toISOString() });
        affected++;
      } else if (action === 'delete') {
        await crmStore.remove('leads', id);
        affected++;
      }
    }

    res.json({ success: true, count: affected, message: `Successfully performed ${action} on ${affected} leads.` });
  } catch (error) {
    res.status(500).json({ error: 'Bulk action failed.' });
  }
});

// ─── POST /api/leads/:id/convert (Convert Lead Workflow) ───────────
router.post('/:id/convert', requireAuth, async (req, res) => {
  try {
    const leadId = req.params.id;
    const lead = await crmStore.findById('leads', leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });

    // Prevent Duplicate Conversion
    if (lead.status === 'Converted') {
      return res.status(400).json({ error: 'This lead has already been converted.' });
    }

    const snapshot = await crmStore.snapshot();
    const companyName = String(req.body.company_name || lead.company || lead.name).trim();
    const contactEmail = String(req.body.contact_email || req.body.email || lead.email || '').trim().toLowerCase();

    const createCompany = req.body.create_company !== false;
    const createContact = req.body.create_contact !== false;
    const createDeal = req.body.create_deal !== false;

    // 1. Check or Create Company
    let existingCompany = (snapshot.companies || []).find(c => (c.name || '').toLowerCase() === companyName.toLowerCase());
    if (createCompany && !existingCompany) {
      existingCompany = await crmStore.create('companies', {
        name: companyName,
        industry: lead.industry || 'General',
        source: lead.source || 'Inbound',
        status: 'active',
        owner: lead.owner || 'Aarav Sharma',
        deals: 1,
        activity: 'Just now',
        created: 0,
        tags: ['converted lead'],
        phone: lead.phone || '',
        created_at: new Date().toISOString()
      });
    }

    // 2. Check or Create Contact
    let existingContact = contactEmail
      ? (snapshot.contacts || []).find(c => (c.email || '').toLowerCase() === contactEmail)
      : null;

    if (createContact && !existingContact) {
      existingContact = await crmStore.create('contacts', {
        name: lead.contact_name || lead.name,
        title: lead.title || 'Lead Contact',
        email: lead.email || '',
        phone: lead.phone || '',
        company_id: existingCompany ? existingCompany.id : null,
        company_name: existingCompany ? existingCompany.name : companyName,
        primary: true,
        created_at: new Date().toISOString()
      });
    }

    // 3. Create Deal if requested
    let newDeal = null;
    if (createDeal) {
      const dealTitle = String(req.body.deal_title || `${companyName} Opportunity`).trim();
      const dealValue = Number(req.body.deal_value || lead.expected_value || 450000);
      const dealStage = String(req.body.deal_stage || 'Qualified');
      const dueText = req.body.close_date ? `Due ${req.body.close_date}` : 'In 14 days';

      newDeal = await crmStore.create('deals', {
        title: dealTitle,
        company: existingCompany ? existingCompany.name : companyName,
        company_id: existingCompany ? existingCompany.id : null,
        contact_id: existingContact ? existingContact.id : null,
        value: dealValue,
        stage: dealStage,
        probability: dealStage === 'Won' ? 100 : (dealStage === 'Proposal' ? 60 : 25),
        owner: lead.owner || 'Aarav Sharma',
        due: dueText,
        month: new Date().toLocaleString('en-US', { month: 'long' }),
        tag: 'converted lead',
        deal_type: 'new_business',
        created_at: new Date().toISOString()
      });
    }

    // 4. Create Follow-up Task
    const newTask = await crmStore.create('tasks', {
      title: `Initial discovery call with ${lead.contact_name || lead.name}`,
      company: existingCompany ? existingCompany.name : companyName,
      due: 'Today · 3:00 PM',
      bucket: 'today',
      priority: 'high',
      done: false,
      assignee: lead.owner || 'Aarav Sharma'
    });

    // 5. Update Lead Status to Converted
    const updatedLead = await crmStore.update('leads', leadId, {
      status: 'Converted',
      converted_company_id: existingCompany ? existingCompany.id : null,
      converted_contact_id: existingContact ? existingContact.id : null,
      converted_deal_id: newDeal ? newDeal.id : null,
      updated_at: new Date().toISOString()
    });

    // 6. Record Activity
    await crmStore.create('activities', {
      type: 'deal',
      icon: '⚡',
      text: `<strong>Converted Lead: ${lead.name}</strong> into Company (${companyName})${newDeal ? ` and Deal (${newDeal.title})` : ''}`,
      time: 'Just now'
    });

    res.json({
      success: true,
      message: 'Lead converted successfully.',
      lead: updatedLead,
      converted: {
        company: existingCompany,
        contact: existingContact,
        deal: newDeal,
        task: newTask
      }
    });
  } catch (error) {
    console.error('Lead conversion error:', error.message);
    res.status(500).json({ error: `Lead conversion failed: ${error.message}` });
  }
});

module.exports = router;
