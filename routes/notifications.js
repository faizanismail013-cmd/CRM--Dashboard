/**
 * SmartPay CRM — Notifications Routes
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification
} = require('../db');

// Get user notifications (paginated, unread first)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id || req.session?.user?.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const result = await getNotifications(userId, { page, limit });
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

// Get unread count (for badge)
router.get('/unread-count', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id || req.session?.user?.id;
    const count = await getUnreadCount(userId);
    res.json({ count });
  } catch (error) { next(error); }
});

// Mark single notification as read
router.patch('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id || req.session?.user?.id;
    const notif = await markNotificationRead(req.params.id, userId);
    if (!notif) return res.status(404).json({ error: 'Notification not found.' });
    res.json(notif);
  } catch (error) { next(error); }
});

// Mark all as read
router.post('/mark-all-read', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id || req.session?.user?.id;
    await markAllNotificationsRead(userId);
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (error) { next(error); }
});

// Delete notification
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id || req.session?.user?.id;
    const deleted = await deleteNotification(req.params.id, userId);
    if (!deleted) return res.status(404).json({ error: 'Notification not found.' });
    res.status(204).end();
  } catch (error) { next(error); }
});

module.exports = router;
