/**
 * SmartPay CRM — Audit Log Routes (Admin Only)
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getAuditLogs } = require('../db');

// Get audit logs (paginated, filterable) — admin only
router.get('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const userId = req.query.user_id ? Number(req.query.user_id) : undefined;
    const resource = req.query.resource || undefined;
    const action = req.query.action || undefined;
    const from = req.query.from || undefined;
    const to = req.query.to || undefined;

    const result = await getAuditLogs({ page, limit, userId, resource, action, from, to });

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

module.exports = router;
