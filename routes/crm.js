/**
 * SmartPay CRM — CRM Resource Routes
 * Full CRUD with pagination, filtering, sorting, search, bulk import/export
 */

const express = require('express');
const multer = require('multer');
const { parse: csvParse } = require('csv-parse/sync');
const { stringify: csvStringify } = require('csv-stringify/sync');
const router = express.Router();

const { requireAuth, rbacFilter, canModify, canDelete } = require('../middleware/auth');
const crmStore = require('../crm-store');
const { createAuditLog, createNotification } = require('../db');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const crmResources = new Set(['companies', 'customers', 'contacts', 'deals', 'tasks', 'activities', 'letters', 'leads']);

const allowedFields = {
  companies: [
    'name', 'initial', 'logo', 'industry', 'owner', 'status', 'customer_status', 'customer_type',
    'gst_number', 'pan_number', 'website', 'phone', 'alternate_phone', 'email', 'alternate_email',
    'billing_address', 'shipping_address', 'city', 'state', 'country', 'pin_code', 'notes',
    'deals', 'activity', 'created', 'tags', 'source'
  ],
  customers: [
    'name', 'initial', 'logo', 'industry', 'owner', 'status', 'customer_status', 'customer_type',
    'gst_number', 'pan_number', 'website', 'phone', 'alternate_phone', 'email', 'alternate_email',
    'billing_address', 'shipping_address', 'city', 'state', 'country', 'pin_code', 'notes',
    'deals', 'activity', 'created', 'tags', 'source'
  ],
  contacts: ['name', 'initials', 'title', 'email', 'phone', 'primary', 'company_id', 'company_name', 'department', 'contact_role'],
  deals: ['title', 'company', 'company_id', 'contact_id', 'value', 'stage', 'probability', 'owner', 'due', 'month', 'tag', 'deal_type'],
  tasks: ['title', 'company', 'due', 'bucket', 'priority', 'done', 'assignee'],
  activities: ['type', 'icon', 'text', 'time'],
  letters: ['type', 'employeeName', 'recipientEmail', 'subject', 'createdAt', 'status', 'error_message', 'letter_data', 'sent_at'],
  leads: ['name', 'company', 'contact_name', 'email', 'phone', 'source', 'industry', 'status', 'score', 'expected_value', 'next_followup', 'owner', 'notes']
};

const searchableFields = {
  companies: ['name', 'industry', 'owner', 'status', 'customer_id', 'gst_number', 'phone', 'email'],
  customers: ['name', 'industry', 'owner', 'status', 'customer_id', 'gst_number', 'phone', 'email'],
  contacts: ['name', 'title', 'email', 'phone'],
  deals: ['title', 'company', 'owner', 'stage'],
  tasks: ['title', 'company', 'assignee'],
  activities: ['text', 'type'],
  letters: ['employeeName', 'recipientEmail', 'subject', 'status'],
  leads: ['name', 'company', 'contact_name', 'email', 'phone', 'source', 'status', 'owner']
};

const sortableFields = {
  companies: ['name', 'industry', 'owner', 'status', 'deals', 'created', 'created_at', 'id'],
  customers: ['name', 'industry', 'owner', 'status', 'deals', 'created', 'created_at', 'id'],
  contacts: ['name', 'title', 'email', 'created_at', 'id'],
  deals: ['title', 'company', 'value', 'stage', 'probability', 'owner', 'due', 'created_at', 'id'],
  tasks: ['title', 'company', 'due', 'priority', 'bucket', 'created_at', 'id'],
  leads: ['name', 'company', 'score', 'expected_value', 'created_at', 'id'],
  activities: ['type', 'time', 'created_at', 'id'],
  letters: ['type', 'employeeName', 'createdAt', 'created_at', 'id', 'status']
};

function pickResourceFields(resource, body) {
  const targetResource = resource === 'customers' ? 'companies' : resource;
  const fields = allowedFields[targetResource] || [];
  return fields.reduce((result, field) => {
    if (Object.hasOwn(body, field)) result[field] = body[field];
    return result;
  }, {});
}

function validateRecord(resource, record) {
  if (['companies', 'customers'].includes(resource) && !String(record.name || '').trim()) return 'Company name is required.';
  if (resource === 'contacts' && (!String(record.name || '').trim() || !/^\S+@\S+\.\S+$/.test(record.email || ''))) return 'A contact name and valid email are required.';
  if (resource === 'deals' && (!String(record.title || '').trim() || !String(record.company || '').trim() || !Number.isFinite(Number(record.value)) || Number(record.value) < 0)) return 'Deal title, company, and a valid value are required.';
  if (resource === 'tasks' && !String(record.title || '').trim()) return 'Task title is required.';
  if (resource === 'activities' && !String(record.text || '').trim()) return 'Activity details are required.';
  if (resource === 'letters' && !['offer', 'appointment', 'resignation', 'termination', 'experience'].includes(record.type)) return 'A supported letter type is required.';
  return null;
}

function enrichRecord(resource, record, req) {
  const userName = req.user?.name || req.session?.user?.name || 'Unassigned';
  const userId = req.user?.id || req.session?.user?.id;

  if (['companies', 'customers'].includes(resource)) Object.assign(record, {
    user_id: userId, initial: record.name?.trim()[0]?.toUpperCase(), logo: record.logo || 'logo-blue',
    owner: record.owner || userName, status: String(record.status || 'lead').toLowerCase(),
    deals: record.deals || 0, activity: 'Just now', created: record.created || Date.now(), tags: Array.isArray(record.tags) ? record.tags : []
  });
  if (resource === 'contacts') Object.assign(record, {
    user_id: userId, initials: record.initials || record.name?.split(' ').map(p => p[0]).join('').slice(0, 2),
    phone: record.phone || '—', primary: Boolean(record.primary)
  });
  if (resource === 'deals') Object.assign(record, {
    user_id: userId, value: Number(record.value), probability: Number(record.probability || 10),
    stage: record.stage || 'New Lead', owner: record.owner || userName,
    due: record.due || '—', month: record.month || 'Unscheduled', tag: record.tag || ''
  });
  if (resource === 'tasks') Object.assign(record, {
    user_id: userId, done: Boolean(record.done), bucket: record.bucket || 'today',
    priority: record.priority || 'medium', due: record.due || 'Today',
    assignee: record.assignee || userName, company: record.company || 'Unlinked task'
  });
  if (resource === 'activities') Object.assign(record, {
    user_id: userId, icon: record.icon || { call: '☎', email: '✉', meeting: '▣', note: '▤' }[record.type] || '▤',
    time: record.time || 'Just now'
  });
  if (resource === 'letters') Object.assign(record, {
    user_id: userId, createdAt: new Date().toISOString(), status: record.status || 'generated'
  });
  return record;
}

// Reference to WebSocket broadcast (set by server.js)
let wsBroadcast = null;
function setWsBroadcast(fn) { wsBroadcast = fn; }

function broadcast(event, data) {
  if (wsBroadcast) wsBroadcast(event, data);
}

// ─── Full CRM Snapshot ──────────────────────────────────────────────

router.get('/', requireAuth, async (req, res, next) => {
  try { res.json(await crmStore.snapshot()); } catch (error) { next(error); }
});

// ─── List with Pagination, Filtering, Sorting, Search ───────────────

router.get('/:resource', requireAuth, rbacFilter, async (req, res, next) => {
  const { resource } = req.params;
  if (!crmResources.has(resource)) return res.status(404).json({ error: 'Unknown CRM resource.' });

  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const sort = sortableFields[resource]?.includes(req.query.sort) ? req.query.sort : 'id';
    const order = req.query.order === 'asc' ? 'asc' : 'desc';
    const search = (req.query.search || '').trim();

    // Build filters from query params (exclude pagination/sort/search params)
    const reservedParams = ['page', 'limit', 'sort', 'order', 'search', 'value_min', 'value_max'];
    const filters = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (!reservedParams.includes(key) && allowedFields[resource]?.includes(key)) {
        filters[key] = value;
      }
    }

    // Range filters for deals
    if (resource === 'deals') {
      if (req.query.value_min) filters._value_min = Number(req.query.value_min);
      if (req.query.value_max) filters._value_max = Number(req.query.value_max);
    }

    // Merge RBAC filter
    Object.assign(filters, req.rbacFilter);

    const result = await crmStore.listPaginated(resource, {
      page, limit, sort, order, search,
      searchFields: searchableFields[resource],
      filters
    });

    res.json({
      data: result.data,
      meta: {
        page, limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit)
      }
    });
  } catch (error) { next(error); }
});

// ─── CSV Import ─────────────────────────────────────────────────────

router.post('/import/:resource', requireAuth, upload.single('file'), async (req, res, next) => {
  const { resource } = req.params;
  if (!crmResources.has(resource)) return res.status(404).json({ error: 'Unknown CRM resource.' });

  const userRole = (req.user?.role || 'rep').toLowerCase();
  if (userRole === 'rep') return res.status(403).json({ error: 'Only managers and admins can import.' });

  if (!req.file) return res.status(400).json({ error: 'Upload a CSV file.' });

  try {
    const csvContent = req.file.buffer.toString('utf8');
    const parsed = csvParse(csvContent, { columns: true, skip_empty_lines: true, trim: true });

    if (parsed.length === 0) return res.status(400).json({ error: 'CSV file is empty.' });
    if (parsed.length > 500) return res.status(400).json({ error: 'Maximum 500 records per import.' });

    const results = [];
    const errors = [];
    for (let i = 0; i < parsed.length; i++) {
      const raw = pickResourceFields(resource, parsed[i]);
      const record = enrichRecord(resource, raw, req);
      const err = validateRecord(resource, record);
      if (err) {
        errors.push({ row: i + 2, error: err, data: parsed[i] }); // +2 for header + 0-index
      } else {
        const created = await crmStore.create(resource, record);
        results.push(created);
      }
    }

    const userId = req.user?.id || req.session?.user?.id;
    try { await createAuditLog(userId, 'import', resource, null, { count: results.length, errors: errors.length, filename: req.file.originalname }, req.ip); } catch (e) { /* ignore */ }

    res.status(201).json({ imported: results.length, failed: errors.length, errors: errors.slice(0, 10), data: results });
  } catch (error) {
    console.error('CSV import error:', error.message);
    res.status(400).json({ error: 'Failed to parse CSV file: ' + error.message });
  }
});

// ─── CSV Export ──────────────────────────────────────────────────────

router.get('/export/:resource', requireAuth, rbacFilter, async (req, res, next) => {
  const { resource } = req.params;
  if (!crmResources.has(resource)) return res.status(404).json({ error: 'Unknown CRM resource.' });

  try {
    const filters = { ...req.rbacFilter };
    const data = await crmStore.listPaginated(resource, { page: 1, limit: 10000, sort: 'id', order: 'desc', filters });
    
    if (data.data.length === 0) return res.status(404).json({ error: 'No records to export.' });

    // Remove internal fields
    const exportData = data.data.map(row => {
      const { user_id, created_at, updated_at, ...rest } = row;
      return rest;
    });

    const csv = csvStringify(exportData, { header: true });

    const userId = req.user?.id || req.session?.user?.id;
    try { await createAuditLog(userId, 'export', resource, null, { count: data.data.length }, req.ip); } catch (e) { /* ignore */ }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${resource}_export_${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) { next(error); }
});

// ─── Get Single Record ──────────────────────────────────────────────

router.get('/:resource/:id', requireAuth, async (req, res, next) => {
  const { resource, id } = req.params;
  if (!crmResources.has(resource)) return res.status(404).json({ error: 'Unknown CRM resource.' });

  try {
    const record = await crmStore.findById(resource, id);
    if (!record) return res.status(404).json({ error: 'Record not found.' });
    res.json(record);
  } catch (error) { next(error); }
});

// ─── Create ─────────────────────────────────────────────────────────

router.post('/:resource', requireAuth, async (req, res, next) => {
  const { resource } = req.params;
  if (!crmResources.has(resource)) return res.status(404).json({ error: 'Unknown CRM resource.' });

  const record = enrichRecord(resource, pickResourceFields(resource, req.body || {}), req);
  const error = validateRecord(resource, record);
  if (error) return res.status(400).json({ error });

  try {
    const created = await crmStore.create(resource, record);
    const userId = req.user?.id || req.session?.user?.id;

    // Audit
    try { await createAuditLog(userId, 'create', resource, created.id, record, req.ip, req.headers['user-agent']); } catch (e) { /* ignore */ }

    // Notifications
    try { await generateNotification(userId, 'create', resource, created, req); } catch (e) { /* ignore */ }

    // WebSocket broadcast
    broadcast('crm:created', { resource, record: created });

    res.status(201).json(created);
  } catch (storeError) { next(storeError); }
});

// ─── Update ─────────────────────────────────────────────────────────

const updateHandler = async (req, res, next) => {
  const { resource, id } = req.params;
  if (!crmResources.has(resource)) return res.status(404).json({ error: 'Unknown CRM resource.' });

  const updates = pickResourceFields(resource, req.body || {});
  if (Object.hasOwn(updates, 'value')) updates.value = Number(updates.value);
  if (Object.hasOwn(updates, 'probability')) updates.probability = Number(updates.probability);
  if (Object.hasOwn(updates, 'done')) updates.done = Boolean(updates.done);

  try {
    // Check RBAC
    const existing = await crmStore.findById(resource, id);
    if (!existing) return res.status(404).json({ error: 'Record not found.' });

    const userRole = (req.user?.role || 'rep').toLowerCase();
    const userId = req.user?.id || req.session?.user?.id;
    if (!canModify(userRole, existing.user_id, userId)) {
      return res.status(403).json({ error: 'You can only modify your own records.' });
    }

    const updated = await crmStore.update(resource, id, updates);
    if (!updated) return res.status(404).json({ error: 'Record not found.' });

    // Audit with before/after diff
    const changes = {};
    for (const key of Object.keys(updates)) {
      if (existing[key] !== updated[key]) {
        changes[key] = { before: existing[key], after: updated[key] };
      }
    }
    try { await createAuditLog(userId, 'update', resource, Number(id), changes, req.ip, req.headers['user-agent']); } catch (e) { /* ignore */ }

    // Notifications for stage changes
    try { await generateNotification(userId, 'update', resource, updated, req, existing); } catch (e) { /* ignore */ }

    broadcast('crm:updated', { resource, record: updated });
    res.json(updated);
  } catch (storeError) { next(storeError); }
};

router.patch('/:resource/:id', requireAuth, updateHandler);
router.put('/:resource/:id', requireAuth, updateHandler);


// ─── Delete ─────────────────────────────────────────────────────────

router.delete('/:resource/:id', requireAuth, async (req, res, next) => {
  const { resource, id } = req.params;
  if (!crmResources.has(resource)) return res.status(404).json({ error: 'Unknown CRM resource.' });

  try {
    const userRole = (req.user?.role || 'rep').toLowerCase();
    if (!canDelete(userRole)) {
      return res.status(403).json({ error: 'Only managers and admins can delete records.' });
    }

    const existing = await crmStore.findById(resource, id);
    const deleted = await crmStore.remove(resource, id);
    if (!deleted) return res.status(404).json({ error: 'Record not found.' });

    const userId = req.user?.id || req.session?.user?.id;
    try { await createAuditLog(userId, 'delete', resource, Number(id), existing || {}, req.ip, req.headers['user-agent']); } catch (e) { /* ignore */ }

    broadcast('crm:deleted', { resource, id: Number(id) });
    res.status(204).end();
  } catch (error) { next(error); }
});

// ─── Bulk Create ────────────────────────────────────────────────────

router.post('/:resource/bulk', requireAuth, async (req, res, next) => {
  const { resource } = req.params;
  if (!crmResources.has(resource)) return res.status(404).json({ error: 'Unknown CRM resource.' });

  const userRole = (req.user?.role || 'rep').toLowerCase();
  if (userRole === 'rep') return res.status(403).json({ error: 'Only managers and admins can bulk import.' });

  const records = req.body.records;
  if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ error: 'Provide a "records" array.' });
  if (records.length > 100) return res.status(400).json({ error: 'Maximum 100 records per batch.' });

  try {
    const results = [];
    const errors = [];
    for (let i = 0; i < records.length; i++) {
      const raw = pickResourceFields(resource, records[i]);
      const record = enrichRecord(resource, raw, req);
      const err = validateRecord(resource, record);
      if (err) {
        errors.push({ index: i, error: err });
      } else {
        const created = await crmStore.create(resource, record);
        results.push(created);
      }
    }

    const userId = req.user?.id || req.session?.user?.id;
    try { await createAuditLog(userId, 'bulk_create', resource, null, { count: results.length, errors: errors.length }, req.ip); } catch (e) { /* ignore */ }

    if (results.length > 0) broadcast('crm:created', { resource, bulk: true, count: results.length });

    res.status(201).json({ created: results.length, errors, data: results });
  } catch (error) { next(error); }
});



// ─── Notification Generator ─────────────────────────────────────────

async function generateNotification(userId, action, resource, record, req, oldRecord = null) {
  const userName = req.user?.name || 'Someone';

  if (action === 'create') {
    if (resource === 'deals') {
      await createNotification(userId, 'deal_created', 'New Deal Created',
        `${userName} created deal "${record.title}" worth ₹${(record.value || 0).toLocaleString('en-IN')}`,
        { resource, id: record.id }
      );
    }
    if (resource === 'tasks' && record.assignee && record.assignee !== userName) {
      // Notify the assignee (would need user lookup by name — simplified here)
      await createNotification(userId, 'task_assigned', 'Task Assigned',
        `${userName} assigned you the task "${record.title}"`,
        { resource, id: record.id }
      );
    }
  }

  if (action === 'update' && resource === 'deals' && oldRecord) {
    if (oldRecord.stage !== record.stage) {
      await createNotification(userId, 'deal_stage_changed', 'Deal Stage Changed',
        `"${record.title}" moved from ${oldRecord.stage} to ${record.stage}`,
        { resource, id: record.id, oldStage: oldRecord.stage, newStage: record.stage }
      );
      if (record.stage === 'Won') {
        await createNotification(userId, 'deal_won', '🎉 Deal Won!',
          `Congratulations! "${record.title}" (₹${(record.value || 0).toLocaleString('en-IN')}) has been won!`,
          { resource, id: record.id }
        );
      }
    }
  }
}

module.exports = { router, setWsBroadcast };
