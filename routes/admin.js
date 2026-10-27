/**
 * SmartPay CRM — Admin Routes
 * User management, role changes, admin bootstrap
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { listUsers, updateUserRole, deactivateUser, findUserById, createAuditLog } = require('../db');

// List all users (paginated)
router.get('/users', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const search = req.query.search || undefined;

    const result = await listUsers({ page, limit, search });
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

// Change user role
router.patch('/users/:id/role', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role) return res.status(400).json({ error: 'Role is required.' });

    // Prevent admin from demoting themselves
    if (Number(id) === req.user?.id && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot change your own role.' });
    }

    const updated = await updateUserRole(id, role);
    if (!updated) return res.status(404).json({ error: 'User not found.' });

    try {
      await createAuditLog(req.user?.id, 'role_change', 'users', Number(id),
        { newRole: role, targetUser: updated.name || updated.email },
        req.ip, req.headers['user-agent']
      );
    } catch (e) { /* ignore */ }

    res.json({ success: true, message: `User role updated to ${role}.`, user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role } });
  } catch (error) {
    if (error.message.includes('Invalid role')) return res.status(400).json({ error: error.message });
    next(error);
  }
});

// Deactivate user
router.delete('/users/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    if (Number(id) === req.user?.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    }

    const deactivated = await deactivateUser(id);
    if (!deactivated) return res.status(404).json({ error: 'User not found.' });

    try {
      await createAuditLog(req.user?.id, 'deactivate_user', 'users', Number(id),
        { targetUser: deactivated.name || deactivated.email },
        req.ip, req.headers['user-agent']
      );
    } catch (e) { /* ignore */ }

    res.json({ success: true, message: 'User account deactivated.' });
  } catch (error) { next(error); }
});

// Bootstrap: promote current user to admin (one-time, only if no admins exist)
router.post('/bootstrap', requireAuth, async (req, res, next) => {
  try {
    const db = require('../db');
    const allUsers = await listUsers({ page: 1, limit: 1000 });
    const adminExists = allUsers.data.some(u => u.role === 'admin');

    if (adminExists) {
      return res.status(400).json({ error: 'An admin already exists. Bootstrap is disabled.' });
    }

    const userId = req.user?.id;
    const updated = await updateUserRole(userId, 'admin');
    if (!updated) return res.status(404).json({ error: 'User not found.' });

    try {
      await createAuditLog(userId, 'admin_bootstrap', 'users', userId, { action: 'self-promoted to admin' }, req.ip);
    } catch (e) { /* ignore */ }

    res.json({ success: true, message: 'You are now an admin!', user: { id: updated.id, name: updated.name, role: 'admin' } });
  } catch (error) { next(error); }
});

// Seed Demo Data
router.post('/seed-demo', requireAuth, async (req, res, next) => {
  try {
    const crmStore = require('../crm-store');
    if (typeof crmStore.seedDemoData === 'function') {
      await crmStore.seedDemoData();
    }
    try {
      await createAuditLog(req.user?.id || 1, 'seed_demo', 'system', null, { action: 'seeded demo data' }, req.ip);
    } catch (e) {}
    res.json({ success: true, message: 'Demo business data successfully seeded into CRM store.' });
  } catch (error) { next(error); }
});

module.exports = router;
