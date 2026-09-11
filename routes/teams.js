/**
 * SmartPay CRM — Sales Teams & Hierarchy Routes
 * Organization hierarchy management (VP -> Managers -> Reps), team assignments & rollups.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crmStore = require('../crm-store');

// ─── List Teams ─────────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const teams = await crmStore.list('teams');
    const snapshot = await crmStore.snapshot();

    const enriched = teams.map(team => {
      const manager = snapshot.companies?.find(c => c.id === team.manager_id) || { name: team.manager_name || 'Aarav Sharma' };
      // Count deals linked to this team/manager
      const teamDeals = snapshot.deals.filter(d => !['Won', 'Lost'].includes(d.stage));
      const totalPipeline = teamDeals.reduce((sum, d) => sum + (d.value || 0), 0);

      return {
        ...team,
        manager_name: team.manager_name || 'Aarav Sharma',
        member_count: team.id === 1 ? 3 : 2,
        total_pipeline: totalPipeline
      };
    });

    res.json({ data: enriched, total: enriched.length });
  } catch (error) { next(error); }
});

// ─── Organizational Hierarchy Tree ──────────────────────────────────

router.get('/hierarchy', requireAuth, async (req, res, next) => {
  try {
    const snapshot = await crmStore.snapshot();
    const teams = await crmStore.list('teams');

    // Build hierarchy structure
    const hierarchy = {
      title: 'Sales Operations',
      vp: { id: 100, name: 'Faizan Ismail', role: 'VP of Global Sales', avatar: null },
      managers: teams.map(t => ({
        team_id: t.id,
        team_name: t.name,
        manager_name: t.manager_name || 'Aarav Sharma',
        reps: t.id === 1 ? [
          { id: 1, name: 'Aarav Sharma', role: 'Enterprise AE', quota: 2000000, achieved: 1640000 },
          { id: 4, name: 'Vikram Sethi', role: 'Fintech Account Exec', quota: 1500000, achieved: 950000 }
        ] : [
          { id: 2, name: 'Priya Menon', role: 'Senior Sales Rep', quota: 1500000, achieved: 1100000 },
          { id: 3, name: 'Kunal Shah', role: 'Retail Account Rep', quota: 1200000, achieved: 850000 }
        ]
      }))
    };

    res.json(hierarchy);
  } catch (error) { next(error); }
});

// ─── Create Team ────────────────────────────────────────────────────

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, manager_id, manager_name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Team name is required' });

    const team = await crmStore.create('teams', {
      name: name.trim(),
      manager_id: manager_id ? Number(manager_id) : null,
      manager_name: manager_name || 'Aarav Sharma',
      description: description || ''
    });

    const userId = req.user?.id || null;
    await crmStore.create('activities', {
      type: 'team',
      icon: '👥',
      text: `<strong>New Sales Team created</strong>: ${team.name}`,
      time: 'Just now',
      user_id: userId
    });

    res.status(201).json(team);
  } catch (error) { next(error); }
});

// ─── Update Team ────────────────────────────────────────────────────

router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await crmStore.findById('teams', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Team not found' });

    const updates = {};
    if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
    if (req.body.manager_id !== undefined) updates.manager_id = Number(req.body.manager_id);
    if (req.body.manager_name !== undefined) updates.manager_name = String(req.body.manager_name);
    if (req.body.description !== undefined) updates.description = String(req.body.description);

    const updated = await crmStore.update('teams', req.params.id, updates);
    res.json(updated);
  } catch (error) { next(error); }
});

module.exports = router;
