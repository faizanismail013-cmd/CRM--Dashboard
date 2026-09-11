/**
 * SmartPay CRM — Quota & Target Management Routes
 * Rep & Team sales targets, live achievement calculations, and quota attainment pacing.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crmStore = require('../crm-store');

// ─── List Sales Targets ─────────────────────────────────────────────

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const targets = await crmStore.list('sales_targets');
    res.json({ data: targets, total: targets.length });
  } catch (error) { next(error); }
});

// ─── Attainment Matrix (Target vs Achievement & Pacing) ─────────────

router.get('/attainment', requireAuth, async (req, res, next) => {
  try {
    const snapshot = await crmStore.snapshot();
    const targets = snapshot.sales_targets || [];
    const deals = snapshot.deals || [];
    const teams = snapshot.teams || [];

    const now = new Date();
    const currentMonthStr = 'September';
    const currentDay = now.getDate();
    const daysInMonth = 30;
    const monthProgress = Math.round((currentDay / daysInMonth) * 100);

    // Calculate per-rep attainment
    const reps = [
      { id: 1, name: 'Aarav Sharma', team_name: 'Enterprise Fintech', target: 2000000 },
      { id: 2, name: 'Priya Menon', team_name: 'Commercial SaaS & Retail', target: 1500000 },
      { id: 3, name: 'Kunal Shah', team_name: 'Commercial SaaS & Retail', target: 1200000 }
    ];

    const attainmentList = reps.map(rep => {
      // Find won deals for this rep
      const wonDeals = deals.filter(d => d.owner === rep.name && d.stage === 'Won');
      const achieved = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
      const target = rep.target;
      const attainmentPct = target > 0 ? Math.round((achieved / target) * 100) : 0;
      const gap = Math.max(0, target - achieved);

      // Pacing vs expected day of month progress
      const expectedProgressPct = (currentDay / daysInMonth) * 100;
      const pacingPct = expectedProgressPct > 0 ? Math.round((attainmentPct / expectedProgressPct) * 100) : 100;

      return {
        rep_id: rep.id,
        rep_name: rep.name,
        team_name: rep.team_name,
        target_amount: target,
        achieved_amount: achieved,
        attainment_pct: attainmentPct,
        gap_amount: gap,
        pacing_pct: pacingPct,
        won_deals_count: wonDeals.length
      };
    });

    const totalCompanyTarget = attainmentList.reduce((sum, r) => sum + r.target_amount, 0);
    const totalCompanyAchieved = attainmentList.reduce((sum, r) => sum + r.achieved_amount, 0);
    const overallAttainmentPct = totalCompanyTarget > 0 ? Math.round((totalCompanyAchieved / totalCompanyTarget) * 100) : 0;

    res.json({
      month_name: currentMonthStr,
      month_progress_pct: monthProgress,
      company_target: totalCompanyTarget,
      company_achieved: totalCompanyAchieved,
      company_attainment_pct: overallAttainmentPct,
      reps: attainmentList
    });
  } catch (error) { next(error); }
});

// ─── Set / Update Target Quota ──────────────────────────────────────

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { user_id, rep_name, team_id, period_type = 'monthly', period_name = 'September 2026', target_amount } = req.body;
    if (!target_amount || Number(target_amount) <= 0) {
      return res.status(400).json({ error: 'Valid target quota amount is required' });
    }

    const target = await crmStore.create('sales_targets', {
      user_id: user_id ? Number(user_id) : null,
      rep_name: rep_name || 'Sales Rep',
      team_id: team_id ? Number(team_id) : null,
      period_type,
      period_name: period_name.trim(),
      target_amount: Number(target_amount)
    });

    const userId = req.user?.id || null;
    await crmStore.create('activities', {
      type: 'target',
      icon: '🎯',
      text: `<strong>Target Quota assigned</strong>: ₹${(Number(target_amount) / 100000).toFixed(1)}L for ${rep_name || 'Rep'} (${period_name})`,
      time: 'Just now',
      user_id: userId
    });

    res.status(201).json(target);
  } catch (error) { next(error); }
});

module.exports = router;
