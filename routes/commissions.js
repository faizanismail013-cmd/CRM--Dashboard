/**
 * SmartPay CRM — Commission Engine Routes
 * Tiered commission rules, real-time earnings calculation, approval & payout ledger.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crmStore = require('../crm-store');

// ─── List Commission Ledger ─────────────────────────────────────────

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status = '', user_id = '' } = req.query;
    const commissions = await crmStore.list('commissions');

    let filtered = commissions;
    if (status && status !== 'all') {
      filtered = filtered.filter(c => c.status === status);
    }
    if (user_id && user_id !== 'all') {
      filtered = filtered.filter(c => Number(c.user_id) === Number(user_id));
    }

    res.json({ data: filtered, total: filtered.length });
  } catch (error) { next(error); }
});

// ─── Commission Summary & Leaderboard ───────────────────────────────

router.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const commissions = await crmStore.list('commissions');

    let totalEarned = 0;
    let totalApproved = 0;
    let totalPaid = 0;
    let totalPending = 0;

    const repMap = {};

    commissions.forEach(c => {
      const amt = Number(c.commission_amount) || 0;
      totalEarned += amt;

      if (c.status === 'paid') totalPaid += amt;
      else if (c.status === 'approved') {
        totalApproved += amt;
        totalPending += amt;
      } else {
        totalPending += amt;
      }

      const repName = c.rep_name || 'Sales Rep';
      if (!repMap[repName]) {
        repMap[repName] = { rep_name: repName, earned: 0, paid: 0, pending: 0, deal_count: 0 };
      }
      repMap[repName].earned += amt;
      if (c.status === 'paid') repMap[repName].paid += amt;
      else repMap[repName].pending += amt;
      repMap[repName].deal_count++;
    });

    const leaderboard = Object.values(repMap).sort((a, b) => b.earned - a.earned);

    res.json({
      totalEarned,
      totalApproved,
      totalPaid,
      totalPending,
      leaderboard
    });
  } catch (error) { next(error); }
});

// ─── Trigger Automatic Commission Recalculation ─────────────────────

router.post('/calculate', requireAuth, async (req, res, next) => {
  try {
    const snapshot = await crmStore.snapshot();
    const wonDeals = snapshot.deals.filter(d => d.stage === 'Won');
    const existingCommissions = snapshot.commissions;

    let createdCount = 0;
    const userId = req.user?.id || null;

    for (const deal of wonDeals) {
      const alreadyCalculated = existingCommissions.some(c => c.deal_id === deal.id);
      if (!alreadyCalculated) {
        const dealAmount = Number(deal.value) || 0;
        const rate = 5.0; // Base rate 5%
        const commissionAmount = Math.round(dealAmount * (rate / 100));

        const created = await crmStore.create('commissions', {
          user_id: userId || 1,
          rep_name: deal.owner || 'Aarav Sharma',
          deal_id: deal.id,
          invoice_id: null,
          deal_amount: dealAmount,
          commission_rate: rate,
          commission_amount: commissionAmount,
          status: 'earned',
          earned_date: new Date().toISOString().slice(0, 10),
          notes: `Auto-calculated commission for Won deal: "${deal.title}"`
        });

        createdCount++;
      }
    }

    res.json({
      success: true,
      message: `Commission calculation completed. ${createdCount} new commission entry generated.`,
      new_commissions_count: createdCount
    });
  } catch (error) { next(error); }
});

// ─── Update Commission Status (Approve / Pay) ───────────────────────

router.patch('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['earned', 'approved', 'paid', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid commission status' });
    }

    const updates = { status };
    if (status === 'paid') {
      updates.paid_date = new Date().toISOString().slice(0, 10);
    }

    const updated = await crmStore.update('commissions', req.params.id, updates);
    if (!updated) return res.status(404).json({ error: 'Commission record not found' });

    const userId = req.user?.id || null;
    await crmStore.create('activities', {
      type: 'commission',
      icon: '💰',
      text: `<strong>Commission payment ${status.toUpperCase()}</strong>: ₹${(Number(updated.commission_amount) / 1000).toFixed(1)}k for ${updated.rep_name || 'Rep'}`,
      time: 'Just now',
      user_id: userId
    });

    res.json(updated);
  } catch (error) { next(error); }
});

// ─── Commission Rules (Slabs) ───────────────────────────────────────

router.get('/rules', requireAuth, async (req, res, next) => {
  try {
    const rules = await crmStore.list('commission_rules');
    res.json({ data: rules, total: rules.length });
  } catch (error) { next(error); }
});

router.post('/rules', requireAuth, async (req, res, next) => {
  try {
    const { name, min_attainment_pct, max_attainment_pct, commission_pct, bonus_amount } = req.body;
    if (!name) return res.status(400).json({ error: 'Rule name is required' });

    const rule = await crmStore.create('commission_rules', {
      name: name.trim(),
      min_attainment_pct: Number(min_attainment_pct) || 0,
      max_attainment_pct: Number(max_attainment_pct) || 100,
      commission_pct: Number(commission_pct) || 5.0,
      bonus_amount: Number(bonus_amount) || 0,
      is_active: true
    });

    res.status(201).json(rule);
  } catch (error) { next(error); }
});

module.exports = router;
