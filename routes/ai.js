/**
 * SmartPay CRM — iKnow AI Routes (Upgraded)
 * 
 * Secure API endpoints for iKnow AI Copilot:
 * - POST /api/ai/chat: Process natural language queries with context & multi-turn memory
 * - POST /api/ai/execute-action: Safely execute authorized CRM tools with user confirmation & audit logging
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { buildAiContext } = require('../services/aiContextService');
const { processMessage } = require('../services/aiService');
const crmStore = require('../crm-store');
const { createAuditLog } = require('../db');

// ─── POST /api/ai/chat ───────────────────────────────────────────────

router.post('/chat', requireAuth, async (req, res, next) => {
  try {
    const { message = '', current_page = 'dashboard', entity_type = null, entity_id = null, history = [] } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Valid message prompt is required.' });
    }

    // 1. Build authorized context object with user permissions
    const contextData = await buildAiContext(req.user, current_page, entity_type, entity_id);

    // 2. Process query via AI Provider / Smart Intelligence Engine
    const result = await processMessage(message, contextData, history);

    // 3. Log interaction to CRM activities
    await crmStore.create('activities', {
      type: 'ai_copilot',
      icon: '🤖',
      text: `<strong>iKnow AI Copilot</strong> consulted by ${req.user.name || 'User'} on ${current_page.toUpperCase()}`,
      time: 'Just now',
      user_id: req.user.id
    });

    res.json({
      success: true,
      reply: result.reply,
      actions: result.actions || [],
      customerCard: result.customerCard || null,
      dealCard: result.dealCard || null,
      quotationCard: result.quotationCard || null,
      invoiceCard: result.invoiceCard || null,
      context_summary: contextData.summaryMetrics
    });
  } catch (error) { next(error); }
});

// ─── POST /api/ai/execute-action ────────────────────────────────────

router.post('/execute-action', requireAuth, async (req, res, next) => {
  try {
    const { tool, payload = {}, confirmation_granted } = req.body;

    if (!confirmation_granted) {
      return res.status(400).json({ error: 'Action execution requires explicit confirmation_granted = true' });
    }

    const userId = req.user.id;
    const userName = req.user.name || 'User';
    const todayStr = new Date().toISOString().slice(0, 10);
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    let executionResult = null;

    switch (tool) {
      case 'create_follow_up':
      case 'create_task': {
        const companyName = payload.company_name || 'Customer';
        const title = payload.title || `Follow up with ${companyName}`;
        const task = await crmStore.create('tasks', {
          title,
          company: companyName,
          company_id: payload.company_id ? Number(payload.company_id) : null,
          deal_id: payload.deal_id ? Number(payload.deal_id) : null,
          due_date: payload.due_date || tomorrowStr,
          bucket: 'today',
          done: false,
          priority: payload.priority || 'high',
          assignee: userName,
          user_id: userId
        });

        await crmStore.create('activities', {
          type: 'task',
          icon: '✓',
          text: `<strong>Task created via iKnow AI</strong>: ${title}`,
          time: 'Just now',
          user_id: userId
        });

        try { await createAuditLog(userId, 'Task Created via AI', 'task', task.id, { title, assignee: userName }, req.ip); } catch (e) {}

        executionResult = { message: `Done — follow-up task "${title}" was created for ${task.due_date}.`, task };
        break;
      }

      case 'update_task': {
        if (!payload.task_id) return res.status(400).json({ error: 'task_id is required' });
        const updated = await crmStore.update('tasks', payload.task_id, {
          done: payload.done !== undefined ? Boolean(payload.done) : true,
          priority: payload.priority || undefined
        });

        try { await createAuditLog(userId, 'Task Updated via AI', 'task', payload.task_id, { done: updated.done }, req.ip); } catch (e) {}

        executionResult = { message: `Done — task marked as completed.`, task: updated };
        break;
      }

      case 'create_activity': {
        const activity = await crmStore.create('activities', {
          type: payload.type || 'note',
          icon: payload.icon || '📝',
          text: `<strong>iKnow AI Note</strong>: ${payload.text || 'Logged activity'}`,
          company: payload.company_name || null,
          time: 'Just now',
          user_id: userId
        });

        try { await createAuditLog(userId, 'Activity Logged via AI', 'activity', activity.id, { text: payload.text }, req.ip); } catch (e) {}

        executionResult = { message: `Done — activity logged.`, activity };
        break;
      }

      case 'send_payment_reminder': {
        const companyName = payload.company_name || 'Customer';
        const amount = payload.amount || 'balance';

        const task = await crmStore.create('tasks', {
          title: `Payment Collection Outreach: ${companyName} (${amount})`,
          company: companyName,
          company_id: payload.company_id ? Number(payload.company_id) : null,
          due_date: todayStr,
          bucket: 'today',
          done: false,
          priority: 'urgent',
          assignee: userName,
          user_id: userId
        });

        await crmStore.create('activities', {
          type: 'payment',
          icon: '📧',
          text: `<strong>Payment reminder logged via iKnow AI</strong> for ${companyName} (${amount})`,
          time: 'Just now',
          user_id: userId
        });

        try { await createAuditLog(userId, 'Payment Reminder Triggered via AI', 'company', payload.company_id || 1, { companyName, amount }, req.ip); } catch (e) {}

        executionResult = { message: `Done — payment reminder logged for ${companyName}. Priority task scheduled.`, task };
        break;
      }

      case 'send_quotation_reminder': {
        const quoteNum = payload.quotation_number || 'Quotation';
        const companyName = payload.company_name || 'Client';

        const task = await crmStore.create('tasks', {
          title: `Quotation Follow-Up: ${quoteNum} (${companyName})`,
          company: companyName,
          due_date: todayStr,
          bucket: 'today',
          done: false,
          priority: 'high',
          assignee: userName,
          user_id: userId
        });

        try { await createAuditLog(userId, 'Quotation Reminder Triggered via AI', 'quotation', payload.quotation_id || 1, { quoteNum }, req.ip); } catch (e) {}

        executionResult = { message: `Done — quotation follow-up scheduled for ${quoteNum}.`, task };
        break;
      }

      case 'create_approval_request': {
        const quoteNum = payload.quotation_number || 'Quotation';
        const discountPct = payload.discount_percent || 20;

        const approval = await crmStore.create('approval_requests', {
          quotation_id: payload.quotation_id ? Number(payload.quotation_id) : null,
          approval_type: 'Discount Approval',
          type: 'Discount Approval',
          requested_by: userId,
          requested_by_name: userName,
          requester_name: userName,
          old_value: '15%',
          new_value: `${discountPct}%`,
          status: 'Pending',
          comments: `iKnow AI: Discount of ${discountPct}% requested on ${quoteNum} exceeds standard threshold (15%).`,
          created_at: new Date().toISOString()
        });

        if (payload.quotation_id) {
          await crmStore.update('quotations', payload.quotation_id, { status: 'pending_approval' });
        }

        await crmStore.create('activities', {
          type: 'approval',
          icon: '✋',
          text: `<strong>Manager approval requested via iKnow AI</strong> for ${quoteNum} (${discountPct}% discount)`,
          time: 'Just now',
          user_id: userId
        });

        try { await createAuditLog(userId, 'Approval Request Created via AI', 'approval', approval.id, { quoteNum, discountPct }, req.ip); } catch (e) {}

        executionResult = { message: `Done — discount approval request created for ${quoteNum} (${discountPct}%). Status set to pending_approval.`, approval };
        break;
      }

      default:
        return res.status(400).json({ error: `Unsupported action tool: ${tool}` });
    }

    res.json({
      success: true,
      message: executionResult.message,
      data: executionResult
    });
  } catch (error) { next(error); }
});

module.exports = router;
