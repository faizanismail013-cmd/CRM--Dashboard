/**
 * SmartPay CRM — Daily Automation Scheduler
 * Runs periodic background scans for overdue invoices, expiring quotes,
 * approaching renewals, deal inactivity, and overdue tasks.
 */

const { triggerAutomation, getAutomationSettings } = require('./automationService');
const crmStore = require('../crm-store');

async function runDailyAutomationJob() {
  console.log('\n======================================================');
  console.log('⏰ [SCHEDULER] Running Daily CRM Automation Scan...');
  console.log('======================================================');

  try {
    const snapshot = await crmStore.snapshot();
    const settings = await getAutomationSettings();
    const todayStr = new Date().toISOString().slice(0, 10);

    // 1. Quotation Expiry Reminders (7d, 3d, 1d, expired)
    for (const q of (snapshot.quotations || [])) {
      if (['accepted', 'rejected', 'cancelled', 'expired'].includes((q.status || '').toLowerCase())) continue;
      if (!q.valid_until) continue;

      const daysRemaining = Math.ceil((new Date(q.valid_until) - new Date()) / 86400000);
      if (daysRemaining === 3 || daysRemaining === 1) {
        await triggerAutomation('quotation_expiring', 'quotation', q.id, {
          company_name: q.company_name,
          company_id: q.company_id,
          valid_until: q.valid_until,
          days_remaining: daysRemaining,
          owner: q.created_by || 'Aarav Sharma',
          windowKey: `${todayStr}:${daysRemaining}d`
        });
      } else if (daysRemaining <= 0) {
        await crmStore.update('quotations', q.id, { status: 'expired' });
        await triggerAutomation('quotation_expired', 'quotation', q.id, {
          company_name: q.company_name,
          company_id: q.company_id,
          owner: q.created_by || 'Aarav Sharma',
          windowKey: todayStr
        });
      }
    }

    // 2. Overdue Invoices & Collection Tasks
    for (const inv of (snapshot.invoices || [])) {
      if (inv.status === 'paid') continue;
      if (!inv.due_date) continue;

      const daysOverdue = Math.floor((new Date() - new Date(inv.due_date)) / 86400000);
      if (daysOverdue > 0) {
        await triggerAutomation('invoice_overdue', 'invoice', inv.id, {
          company_name: inv.company_name,
          company_id: inv.company_id,
          due_date: inv.due_date,
          days_overdue_gt: daysOverdue,
          amount: inv.balance_due || inv.total,
          windowKey: daysOverdue >= 7 ? `${todayStr}:escalated` : `${todayStr}:overdue`
        });
      }
    }

    // 3. Renewals (90d, 60d, 30d, due, overdue)
    for (const ren of (snapshot.renewals || [])) {
      if (ren.status === 'renewed') continue;
      if (!ren.renewal_date) continue;

      const daysUntil = Math.ceil((new Date(ren.renewal_date) - new Date()) / 86400000);
      if ([90, 60, 30, 0].includes(daysUntil)) {
        await triggerAutomation(`renewal_${daysUntil === 0 ? 'due' : daysUntil + '_days'}`, 'renewal', ren.id, {
          company_name: ren.company_name,
          company_id: ren.company_id,
          product_name: ren.product_name,
          renewal_date: ren.renewal_date,
          windowKey: `${todayStr}:${daysUntil}d`
        });
      }
    }

    // 4. Inactive Deals (no activity for 7+ days)
    for (const deal of (snapshot.deals || [])) {
      if (['Won', 'Lost'].includes(deal.stage)) continue;
      await triggerAutomation('deal_inactive', 'deal', deal.id, {
        company_name: deal.company,
        company_id: deal.company_id,
        stage: deal.stage,
        owner: deal.owner,
        inactivity_days_gt: 7,
        windowKey: todayStr
      });
    }

    console.log('✅ Daily CRM Automation Scan Completed.\n');
    return { success: true, timestamp: new Date().toISOString() };
  } catch (error) {
    console.error('Daily Automation Job Error:', error.message);
    return { success: false, error: error.message };
  }
}

function initScheduler() {
  console.log('⏰ [SCHEDULER] Initializing Daily CRM Automation Scheduler');
  runDailyAutomationJob().catch(err => console.error('Daily automation job boot error:', err.message));
  setInterval(() => {
    runDailyAutomationJob().catch(err => console.error('Daily automation job recurring error:', err.message));
  }, 6 * 3600 * 1000);
}

module.exports = { runDailyAutomationJob, initScheduler };

