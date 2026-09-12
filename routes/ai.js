/**
 * SmartPay CRM — iKnow AI Routes
 * 
 * Secure API endpoints for iKnow AI Copilot:
 * - POST /api/ai/chat: Process natural language queries with context
 * - POST /api/ai/execute-action: Safely execute authorized CRM tools with user confirmation
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { buildAiContext } = require('../services/aiContextService');
const { processMessage } = require('../services/aiService');
const crmStore = require('../crm-store');

// ─── POST /api/ai/chat ───────────────────────────────────────────────

router.post('/chat', requireAuth, async (req, res, next) => {
  try {
    const { message = '', current_page = 'dashboard', entity_type = null, entity_id = null } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Valid message prompt is required.' });
    }

    // 1. Build authorized context object
    const contextData = await buildAiContext(req.user, current_page, entity_type, entity_id);

    // 2. Process query via AI Provider / Smart Intelligence Engine
    const result = await processMessage(message, contextData);

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
          priority: 'high',
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

        executionResult = { message: `Follow-up task "${title}" created for ${task.due_date}`, task };
        break;
      }

      case 'send_payment_reminder': {
        const companyName = payload.company_name || 'Customer';
        const amount = payload.amount || 'balance';
        const invNum = payload.invoice_number ? `Invoice ${payload.invoice_number}` : 'Outstanding balance';

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

        executionResult = { message: `Payment reminder logged for ${companyName}. Priority task scheduled for collection team.`, task };
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
          comments: `iKnow AI: Discount of ${discountPct}% requested on ${quoteNum} exceeds standard representative threshold (15%).`,
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

        executionResult = { message: `Discount approval request created for ${quoteNum} (${discountPct}%). Status set to pending_approval.`, approval };
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
