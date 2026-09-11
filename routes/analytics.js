/**
 * SmartPay CRM — Analytics Routes
 * Dashboard metrics, pipeline analysis, forecasting, rep performance
 */

const express = require('express');
const router = express.Router();
const { requireAuth, rbacFilter } = require('../middleware/auth');
const crmStore = require('../crm-store');

// ─── Dashboard Overview ─────────────────────────────────────────────

router.get('/dashboard', requireAuth, rbacFilter, async (req, res, next) => {
  try {
    const snapshot = await crmStore.snapshot();
    const { deals, tasks, activities, companies, stages } = snapshot;
    const userRole = (req.user?.role || 'rep').toLowerCase();
    const userId = req.user?.id;
    const userName = req.user?.name;

    // Filter by ownership for reps (with graceful fallback to all workspace records if rep has none assigned yet)
    const userDeals = deals.filter(d => d.user_id === userId || d.owner === userName);
    const filteredDeals = (userRole === 'rep' && userDeals.length > 0) ? userDeals : deals;

    const userTasks = tasks.filter(t => t.user_id === userId || t.assignee === userName);
    const filteredTasks = (userRole === 'rep' && userTasks.length > 0) ? userTasks : tasks;

    const userCompanies = companies.filter(c => c.user_id === userId || c.owner === userName);
    const filteredCompanies = (userRole === 'rep' && userCompanies.length > 0) ? userCompanies : companies;

    const openDeals = filteredDeals.filter(d => !['Won', 'Lost'].includes(d.stage));
    const wonDeals = filteredDeals.filter(d => d.stage === 'Won');
    const lostDeals = filteredDeals.filter(d => d.stage === 'Lost');

    // ─── Core Pipeline Metrics ──────────────────────────────────────
    const pipelineTotal = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
    const wonRevenue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
    const lostRevenue = lostDeals.reduce((sum, d) => sum + (d.value || 0), 0);
    const closedCount = wonDeals.length + lostDeals.length;
    const conversionRate = closedCount > 0 ? ((wonDeals.length / closedCount) * 100).toFixed(1) : 0;
    const avgDealSize = openDeals.length > 0 ? Math.round(pipelineTotal / openDeals.length) : 0;
    const weightedForecast = openDeals.reduce((sum, d) => sum + ((d.value || 0) * (d.probability || 10) / 100), 0);

    // ─── Revenue This Month / This Quarter ──────────────────────────
    const now = new Date();
    const currentMonth = now.toLocaleString('en-US', { month: 'long' });
    const currentMonthNum = now.getMonth(); // 0-indexed
    const currentQuarter = Math.floor(currentMonthNum / 3); // 0=Q1, 1=Q2, 2=Q3, 3=Q4
    const quarterMonths = [currentQuarter * 3, currentQuarter * 3 + 1, currentQuarter * 3 + 2];
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    const wonThisMonth = wonDeals.filter(d => d.month === currentMonth);
    const revenueThisMonth = wonThisMonth.reduce((sum, d) => sum + (d.value || 0), 0);

    const quarterMonthNames = quarterMonths.map(m => monthNames[m]);
    const wonThisQuarter = wonDeals.filter(d => quarterMonthNames.includes(d.month));
    const revenueThisQuarter = wonThisQuarter.reduce((sum, d) => sum + (d.value || 0), 0);

    // ─── Renewal Revenue ────────────────────────────────────────────
    const renewalDeals = wonDeals.filter(d => d.deal_type === 'renewal');
    const renewalRevenue = renewalDeals.reduce((sum, d) => sum + (d.value || 0), 0);

    // ─── Target vs Achievement ──────────────────────────────────────
    const monthlyTarget = 2000000; // ₹20L
    const quarterlyTarget = 6000000; // ₹60L
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), currentMonthNum + 1, 0).getDate();
    const monthProgress = dayOfMonth / daysInMonth;
    const pacing = monthProgress > 0 ? (revenueThisMonth / (monthlyTarget * monthProgress)) * 100 : 0;

    // ─── Follow-ups: Today & Overdue ────────────────────────────────
    const todayFollowups = filteredTasks.filter(t => t.bucket === 'today' && !t.done);
    const overdueFollowups = filteredTasks.filter(t => t.bucket === 'overdue' && !t.done);

    // ─── Deals Closing This Week ────────────────────────────────────
    // Use month-based approximation for seed data (due field is text like "Sep 18")
    const dealsClosingThisWeek = openDeals.filter(d => {
      if (!d.due) return false;
      const dueMonth = d.month || '';
      return dueMonth === currentMonth;
    }).sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 8);

    // ─── New Leads Today ────────────────────────────────────────────
    const newLeadsToday = filteredCompanies.filter(c => c.status === 'lead').slice(0, 5);

    // ─── Sales Leaderboard ──────────────────────────────────────────
    const repMap = {};
    filteredDeals.forEach(d => {
      const rep = d.owner || 'Unassigned';
      if (!repMap[rep]) repMap[rep] = { name: rep, wonRevenue: 0, wonCount: 0, openPipeline: 0, openCount: 0, lostRevenue: 0, lostCount: 0 };
      if (d.stage === 'Won') { repMap[rep].wonRevenue += d.value || 0; repMap[rep].wonCount++; }
      else if (d.stage === 'Lost') { repMap[rep].lostRevenue += d.value || 0; repMap[rep].lostCount++; }
      else { repMap[rep].openPipeline += d.value || 0; repMap[rep].openCount++; }
    });
    const leaderboard = Object.values(repMap)
      .map(r => ({
        ...r,
        winRate: (r.wonCount + r.lostCount) > 0 ? Math.round((r.wonCount / (r.wonCount + r.lostCount)) * 100) : 0,
        quotaPercent: Math.round((r.wonRevenue / monthlyTarget) * 100)
      }))
      .sort((a, b) => b.wonRevenue - a.wonRevenue);

    // ─── Conversion Funnel ──────────────────────────────────────────
    const stageOrder = ['New Lead', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won'];
    const funnel = stageOrder.map(stageName => {
      const stageDeals = filteredDeals.filter(d => d.stage === stageName);
      return {
        stage: stageName,
        count: stageDeals.length,
        value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0)
      };
    });
    // Add conversion rates between stages
    for (let i = 1; i < funnel.length; i++) {
      funnel[i].conversionRate = funnel[i - 1].count > 0
        ? Math.round((funnel[i].count / funnel[i - 1].count) * 100)
        : 0;
    }
    if (funnel.length > 0) funnel[0].conversionRate = 100;

    // ─── Lost-Deal Analysis ─────────────────────────────────────────
    const lostReasons = {};
    lostDeals.forEach(d => {
      const reason = d.lost_reason || 'Other';
      if (!lostReasons[reason]) lostReasons[reason] = { reason, count: 0, value: 0, deals: [] };
      lostReasons[reason].count++;
      lostReasons[reason].value += d.value || 0;
      lostReasons[reason].deals.push({ id: d.id, title: d.title, company: d.company, value: d.value });
    });
    const lostAnalysis = Object.values(lostReasons)
      .sort((a, b) => b.value - a.value)
      .map(r => ({ ...r, percentage: lostRevenue > 0 ? Math.round((r.value / lostRevenue) * 100) : 0 }));

    // ─── Deals by Stage (funnel for charts) ─────────────────────────
    const stageMap = {};
    openDeals.forEach(d => {
      if (!stageMap[d.stage]) stageMap[d.stage] = { count: 0, value: 0 };
      stageMap[d.stage].count++;
      stageMap[d.stage].value += d.value || 0;
    });
    const dealsByStage = Object.entries(stageMap).map(([stage, data]) => ({ stage, ...data }));

    // ─── Task summary ───────────────────────────────────────────────
    const overdueTasks = filteredTasks.filter(t => t.bucket === 'overdue' && !t.done).length;
    const todayTasks = filteredTasks.filter(t => t.bucket === 'today' && !t.done).length;
    const completedTasks = filteredTasks.filter(t => t.done).length;
    const totalTasks = filteredTasks.length;

    // ─── Activity count by type ─────────────────────────────────────
    const activityByType = {};
    activities.forEach(a => {
      activityByType[a.type] = (activityByType[a.type] || 0) + 1;
    });

    res.json({
      pipeline: {
        total: pipelineTotal,
        dealCount: openDeals.length,
        weightedForecast: Math.round(weightedForecast)
      },
      revenue: {
        won: wonRevenue,
        lost: lostRevenue,
        conversionRate: Number(conversionRate),
        avgDealSize,
        thisMonth: revenueThisMonth,
        thisQuarter: revenueThisQuarter,
        renewalRevenue
      },
      target: {
        monthlyTarget,
        quarterlyTarget,
        monthlyAchieved: revenueThisMonth,
        quarterlyAchieved: revenueThisQuarter,
        pacing: Math.round(pacing),
        monthProgress: Math.round(monthProgress * 100)
      },
      followups: {
        today: todayFollowups,
        todayCount: todayFollowups.length,
        overdue: overdueFollowups,
        overdueCount: overdueFollowups.length
      },
      dealsClosingThisWeek,
      newLeadsToday,
      leaderboard,
      funnel,
      lostAnalysis,
      dealsByStage,
      tasks: {
        total: totalTasks,
        overdue: overdueTasks,
        today: todayTasks,
        completed: completedTasks
      },
      activityByType,
      companies: {
        total: filteredCompanies.length,
        active: filteredCompanies.filter(c => c.status === 'active').length,
        leads: filteredCompanies.filter(c => c.status === 'lead').length,
        churned: filteredCompanies.filter(c => c.status === 'churned').length
      }
    });
  } catch (error) { next(error); }
});

// ─── Pipeline Breakdown ─────────────────────────────────────────────

router.get('/pipeline', requireAuth, rbacFilter, async (req, res, next) => {
  try {
    const snapshot = await crmStore.snapshot();
    const deals = snapshot.deals;
    const userRole = (req.user?.role || 'rep').toLowerCase();
    const userId = req.user?.id;

    const filtered = userRole === 'rep'
      ? deals.filter(d => d.user_id === userId || d.owner === req.user?.name)
      : deals;

    const openDeals = filtered.filter(d => !['Won', 'Lost'].includes(d.stage));

    // By stage
    const byStage = {};
    openDeals.forEach(d => {
      if (!byStage[d.stage]) byStage[d.stage] = { deals: [], totalValue: 0, count: 0 };
      byStage[d.stage].deals.push(d);
      byStage[d.stage].totalValue += d.value || 0;
      byStage[d.stage].count++;
    });

    // By month
    const byMonth = {};
    openDeals.forEach(d => {
      const month = d.month || 'Unscheduled';
      if (!byMonth[month]) byMonth[month] = { totalValue: 0, count: 0 };
      byMonth[month].totalValue += d.value || 0;
      byMonth[month].count++;
    });

    // By owner
    const byOwner = {};
    openDeals.forEach(d => {
      const owner = d.owner || 'Unassigned';
      if (!byOwner[owner]) byOwner[owner] = { totalValue: 0, count: 0 };
      byOwner[owner].totalValue += d.value || 0;
      byOwner[owner].count++;
    });

    res.json({ stages: byStage, byStage, byMonth, byOwner, totalDeals: openDeals.length, totalValue: openDeals.reduce((s, d) => s + (d.value || 0), 0) });
  } catch (error) { next(error); }
});

// ─── Forecast ───────────────────────────────────────────────────────

router.get('/forecast', requireAuth, rbacFilter, async (req, res, next) => {
  try {
    const snapshot = await crmStore.snapshot();
    const deals = snapshot.deals;
    const stages = snapshot.stages;
    const userRole = (req.user?.role || 'rep').toLowerCase();
    const userId = req.user?.id;

    const filtered = userRole === 'rep'
      ? deals.filter(d => d.user_id === userId || d.owner === req.user?.name)
      : deals;

    const openDeals = filtered.filter(d => !['Won', 'Lost'].includes(d.stage));

    const forecast = openDeals.map(d => ({
      id: d.id,
      title: d.title,
      company: d.company,
      value: d.value || 0,
      probability: d.probability || 10,
      weightedValue: Math.round((d.value || 0) * (d.probability || 10) / 100),
      stage: d.stage,
      owner: d.owner,
      due: d.due
    }));

    const totalWeighted = forecast.reduce((s, d) => s + d.weightedValue, 0);
    const bestCase = forecast.reduce((s, d) => s + d.value, 0);

    // By stage
    const byStage = {};
    stages.forEach(s => {
      const stageDeals = forecast.filter(d => d.stage === s.name);
      byStage[s.name] = {
        count: stageDeals.length,
        totalValue: stageDeals.reduce((sum, d) => sum + d.value, 0),
        weightedValue: stageDeals.reduce((sum, d) => sum + d.weightedValue, 0),
        probability: s.probability,
        color: s.color
      };
    });

    res.json({ forecastRevenue: totalWeighted, totalWeighted, bestCase, byStage, forecast });
  } catch (error) { next(error); }
});

// ─── Rep Performance ────────────────────────────────────────────────

router.get('/rep-performance', requireAuth, async (req, res, next) => {
  try {
    const userRole = (req.user?.role || 'rep').toLowerCase();
    if (userRole === 'rep') {
      return res.status(403).json({ error: 'Manager or admin access required.' });
    }

    const snapshot = await crmStore.snapshot();
    const { deals, tasks, activities } = snapshot;

    // Group by owner/assignee
    const reps = {};

    deals.forEach(d => {
      const rep = d.owner || 'Unassigned';
      if (!reps[rep]) reps[rep] = { name: rep, dealsWon: 0, dealsOpen: 0, revenue: 0, pipeline: 0, tasksCompleted: 0, tasksOpen: 0, activities: 0 };
      if (d.stage === 'Won') { reps[rep].dealsWon++; reps[rep].revenue += d.value || 0; }
      else if (d.stage !== 'Lost') { reps[rep].dealsOpen++; reps[rep].pipeline += d.value || 0; }
    });

    tasks.forEach(t => {
      const rep = t.assignee || 'Unassigned';
      if (!reps[rep]) reps[rep] = { name: rep, dealsWon: 0, dealsOpen: 0, revenue: 0, pipeline: 0, tasksCompleted: 0, tasksOpen: 0, activities: 0 };
      if (t.done) reps[rep].tasksCompleted++;
      else reps[rep].tasksOpen++;
    });

    const repList = Object.values(reps).sort((a, b) => b.revenue - a.revenue);

    res.json({ reps: repList });
  } catch (error) { next(error); }
});

module.exports = router;
