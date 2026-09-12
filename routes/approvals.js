/**
 * SmartPay CRM — Approvals Route Module
 * Discount (>15%), Deal (>₹10L), PO verification, and HR document approval requests.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crmStore = require('../crm-store');
const { createNotification, createAuditLog } = require('../db');

// ─── GET /api/approvals ─────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const status = String(req.query.status || 'all').trim();
    const snapshot = await crmStore.snapshot();
    let list = snapshot.approvals || [];

    if (status !== 'all') {
      list = list.filter(a => (a.status || '').toLowerCase() === status.toLowerCase());
    }

    res.json({ data: list });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch approval requests.' });
  }
});

// ─── POST /api/approvals (Request Approval) ─────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { type, entity_type, entity_id, old_value, new_value, comments = '' } = req.body;
    if (!type || !entity_type || !entity_id) {
      return res.status(400).json({ error: 'Approval type, entity_type, and entity_id are required.' });
    }

    // Check duplicate pending approval for same entity
    const snapshot = await crmStore.snapshot();
    const existing = (snapshot.approvals || []).find(a => 
      a.entity_type === entity_type && 
      Number(a.entity_id) === Number(entity_id) && 
      a.status === 'Pending'
    );
    if (existing) {
      return res.status(400).json({ error: 'A pending approval request already exists for this record.' });
    }

    const app = await crmStore.create('approvals', {
      type: String(type).trim(),
      entity_type,
      entity_id: Number(entity_id),
      requested_by: req.user?.id || 1,
      requester_name: req.user?.name || 'Sales Rep',
      approver_name: 'Sales Manager',
      status: 'Pending',
      old_value: String(old_value || ''),
      new_value: String(new_value || ''),
      comments: String(comments).trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Notify approver
    try {
      await createNotification(1, {
        type: 'approval',
        title: `Approval Required: ${type}`,
        message: `${req.user?.name || 'Sales Rep'} requested approval for ${entity_type} #${entity_id}`,
        priority: 'high',
        entity_type,
        entity_id
      });
    } catch (e) {}

    res.status(201).json(app);
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit approval request.' });
  }
});

// ─── PUT /api/approvals/:id/decide ──────────────────────────────────
router.put('/:id/decide', requireAuth, async (req, res) => {
  try {
    const { decision, comments } = req.body; // Approved or Rejected
    if (!['Approved', 'Rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be Approved or Rejected.' });
    }

    const snapshot = await crmStore.snapshot();
    const approval = (snapshot.approvals || []).find(a => Number(a.id) === Number(req.params.id));
    if (!approval) return res.status(404).json({ error: 'Approval request not found.' });

    // Self-approval protection check: requester cannot approve their own request unless Admin
    if (approval.requested_by && approval.requested_by === req.user?.id && req.user?.role !== 'admin' && req.user?.role !== 'Sales Manager') {
      return res.status(403).json({ error: 'Self-approval protection: You cannot approve your own request.' });
    }

    if (decision === 'Rejected' && (!comments || !comments.trim())) {
      return res.status(400).json({ error: 'Rejection reason comment is required.' });
    }

    const updated = await crmStore.update('approvals', req.params.id, {
      status: decision,
      comments: comments ? String(comments).trim() : approval.comments,
      reviewed_by: req.user?.id || 1,
      approver_name: req.user?.name || 'Sales Manager',
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Handle entity status update on approval
    if (approval.entity_type === 'quotation') {
      if (decision === 'Approved') {
        await crmStore.update('quotations', approval.entity_id, { status: 'approved' });
      } else {
        await crmStore.update('quotations', approval.entity_id, { status: 'rejected' });
      }
    }

    // Notify requester
    try {
      await createNotification(approval.requested_by || 1, {
        type: 'approval',
        title: `Approval ${decision}: ${approval.type}`,
        message: `Your request for ${approval.entity_type} #${approval.entity_id} was ${decision.toLowerCase()} by ${req.user?.name || 'Manager'}.`,
        priority: decision === 'Approved' ? 'normal' : 'high',
        entity_type: approval.entity_type,
        entity_id: approval.entity_id
      });
      await createAuditLog(req.user?.id || 1, `Approval ${decision}`, 'approval', approval.id, { decision, comments }, req.ip);
    } catch (e) {}

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to process approval decision.' });
  }
});

module.exports = router;
