/**
 * SmartPay CRM — Automation Service Engine
 * Event-Condition-Action evaluation with idempotency, condition matching,
 * task generation, notification dispatch, approval creation, and audit trail.
 */

const crmStore = require('../crm-store');
const { createNotification, createAuditLog } = require('../db');

// Default Thresholds & Settings
const DEFAULT_SETTINGS = {
  quote_followup_days: 2,
  deal_inactivity_days: 7,
  payment_overdue_days: 7,
  renewal_reminder_days: 30,
  discount_approval_percent: 15,
  large_deal_threshold: 1000000,
  quote_expiry_days: 7
};

async function getAutomationSettings() {
  const snapshot = await crmStore.snapshot();
  return { ...DEFAULT_SETTINGS, ...(snapshot.automation_settings || {}) };
}

/**
 * Main Entry Point: triggerAutomation(eventType, entityType, entityId, context)
 */
async function triggerAutomation(eventType, entityType, entityId, context = {}) {
  try {
    const snapshot = await crmStore.snapshot();
    const rules = (snapshot.automations || []).filter(r => r.is_active && (r.event === eventType || r.event_type === eventType));
    
    if (!rules.length) {
      return { triggered: false, reason: 'No active rules matching event' };
    }

    const settings = await getAutomationSettings();
    const results = [];

    for (const rule of rules) {
      // 1. Idempotency Check
      const windowKey = context.windowKey || new Date().toISOString().slice(0, 10);
      const idempotencyKey = context.idempotencyKey || `${entityType}:${entityId}:${rule.id}:${eventType}:${windowKey}`;
      
      const existingLogs = snapshot.automation_logs || [];
      const alreadyExecuted = existingLogs.some(l => l.idempotency_key === idempotencyKey && l.execution_status === 'success');
      if (alreadyExecuted) {
        results.push({ rule_id: rule.id, status: 'skipped', reason: 'Already executed (Idempotent)' });
        continue;
      }

      // 2. Condition Evaluation
      const isMatch = evaluateConditions(rule.condition_json, context, settings);
      if (!isMatch) {
        results.push({ rule_id: rule.id, status: 'skipped', reason: 'Conditions not met' });
        continue;
      }

      // 3. Action Execution
      let actionResult = null;
      let status = 'success';
      let errorMsg = null;

      try {
        actionResult = await executeActions(rule.action_json, entityType, entityId, context, settings);
      } catch (err) {
        status = 'failed';
        errorMsg = err.message;
      }

      // 4. Log Execution
      const logEntry = await crmStore.create('automation_logs', {
        automation_id: rule.id,
        rule_id: rule.id,
        event: eventType,
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId,
        idempotency_key: idempotencyKey,
        execution_status: status,
        execution_message: status === 'success' ? 'Actions executed successfully' : errorMsg,
        payload_json: JSON.stringify({ context, actionResult }),
        error_message: errorMsg,
        executed_at: new Date().toISOString()
      });

      // 5. Timeline Event
      if (status === 'success' && (context.company_name || context.company_id)) {
        try {
          await crmStore.create('activities', {
            type: 'automation',
            text: `🤖 <strong>Automation Executed:</strong> ${rule.name || eventType}`,
            company_id: context.company_id || 1,
            company: context.company_name || 'System'
          });
        } catch (e) {}
      }

      results.push({ rule_id: rule.id, status, log_id: logEntry ? logEntry.id : null });
    }

    return { triggered: true, results };
  } catch (error) {
    console.error('triggerAutomation Error:', error.message);
    return { error: error.message };
  }
}

function evaluateConditions(conditionJson, context, settings) {
  if (!conditionJson) return true;
  let conditions = typeof conditionJson === 'string' ? JSON.parse(conditionJson || '{}') : conditionJson;
  
  for (const [key, expectedValue] of Object.entries(conditions)) {
    const actualValue = context[key];

    if (key === 'stage' && actualValue !== expectedValue) return false;
    if (key === 'discount_gt' && Number(actualValue) <= Number(expectedValue || settings.discount_approval_percent)) return false;
    if (key === 'value_gt' && Number(actualValue) <= Number(expectedValue || settings.large_deal_threshold)) return false;
    if (key === 'days_overdue_gt' && Number(actualValue) <= Number(expectedValue)) return false;
    if (key === 'inactivity_days_gt' && Number(actualValue) <= Number(expectedValue || settings.deal_inactivity_days)) return false;
  }
  return true;
}

async function executeActions(actionJson, entityType, entityId, context, settings) {
  let actions = typeof actionJson === 'string' ? JSON.parse(actionJson || '{}') : actionJson;
  if (!Array.isArray(actions)) actions = [actions];

  const results = [];
  for (const act of actions) {
    if (act.type === 'create_task') {
      const dueDays = Number(act.due_days || 2);
      const dueDate = new Date(Date.now() + dueDays * 86400000).toISOString().slice(0, 10);
      const task = await crmStore.create('tasks', {
        title: act.title || `Follow up on ${entityType}`,
        company: context.company_name || 'Unlinked task',
        company_id: context.company_id || null,
        due: dueDate,
        bucket: 'today',
        priority: act.priority || 'medium',
        done: false,
        assignee: context.owner || 'Aarav Sharma',
        entity_type: entityType,
        entity_id: entityId
      });
      results.push({ action: 'create_task', taskId: task.id });
    }

    if (act.type === 'create_notification') {
      const notif = await createNotification(context.user_id || 1, {
        type: act.category || entityType,
        title: act.title || `Attention required for ${entityType}`,
        message: act.message || `Automated alert for ${context.company_name || 'record'}`,
        priority: act.priority || 'normal',
        entity_type: entityType,
        entity_id: entityId
      });
      results.push({ action: 'create_notification', notifId: notif?.id });
    }

    if (act.type === 'create_approval') {
      const app = await crmStore.create('approvals', {
        type: act.approval_type || 'Threshold Approval',
        entity_type: entityType,
        entity_id: entityId,
        requester_name: context.owner || 'Sales Rep',
        approver_name: 'Sales Manager',
        status: 'Pending',
        old_value: String(context.old_value || ''),
        new_value: String(context.new_value || ''),
        comments: act.reason || 'Automated approval required',
        created_at: new Date().toISOString()
      });
      results.push({ action: 'create_approval', approvalId: app.id });
    }
  }
  return results;
}

async function testAutomationRule(ruleId, testContext = {}) {
  const snapshot = await crmStore.snapshot();
  const rule = (snapshot.automations || []).find(r => Number(r.id) === Number(ruleId));
  if (!rule) throw new Error('Automation rule not found.');

  const settings = await getAutomationSettings();
  let cond = {};
  try {
    cond = typeof rule.condition_json === 'string' ? JSON.parse(rule.condition_json) : (rule.condition_json || {});
  } catch (e) {
    cond = {};
  }

  const defaultContext = {
    stage: cond.stage || 'Proposal Sent',
    discount_gt: (cond.discount_gt || 15) + 5,
    value_gt: (cond.value_gt || 1000000) + 100000,
    days_overdue_gt: (cond.days_overdue_gt || 5) + 2,
    inactivity_days_gt: (cond.inactivity_days_gt || 7) + 3,
    company_name: 'RazorpayX Partners',
    company_id: 1,
    deal_title: 'Payment gateway expansion proposal',
    deal_value: 800000
  };

  const mergedContext = { ...defaultContext, ...testContext };
  const isMatch = evaluateConditions(rule.condition_json, mergedContext, settings);
  const actions = typeof rule.action_json === 'string' ? JSON.parse(rule.action_json) : rule.action_json;

  return {
    rule_id: rule.id,
    rule_name: rule.name,
    event: rule.event,
    conditions_evaluated: rule.condition_json,
    is_match: isMatch,
    actions_would_execute: isMatch ? (Array.isArray(actions) ? actions : [actions]) : [],
    test_mode: 'DRY_RUN (No real emails or database records created)',
    context_used: mergedContext
  };
}

module.exports = {
  triggerAutomation,
  getAutomationSettings,
  testAutomationRule,
  DEFAULT_SETTINGS
};
