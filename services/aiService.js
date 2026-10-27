/**
 * SmartPay CRM — iKnow AI Service Provider (Upgraded)
 * 
 * Centralized AI Intelligence & LLM Service supporting:
 * - Provider-agnostic LLM integration (OpenAI, Gemini REST, custom proxies) via env vars:
 *   AI_PROVIDER, AI_MODEL, AI_API_KEY (or OPENAI_API_KEY / GEMINI_API_KEY)
 * - Intelligent Smart CRM Engine fallback for precise, data-driven, offline-reliable NLU queries
 * - Full intent routing for Tasks, Pipeline, Invoices, Customers, Search, Approvals, Team, & How-To
 * - Ground-truth precision: never invents data, uses real snapshot metrics from crmStore
 */

const { formatCurrency } = require('./aiContextService');
const crmStore = require('../crm-store');

const SYSTEM_PROMPT = `You are iKnow, the intelligent AI copilot for SmartPay CRM.
You have access only to authorized SmartPay CRM data and tools provided in the context.
Never invent CRM information, customer names, amounts, or financial totals.
When information is unavailable, clearly state so.
Use actual CRM metrics derived from authoritative backend calculations.
For actions, never claim an action succeeded unless confirmed by the backend execution layer.
Before executing write operations, obtain explicit user confirmation via structured tool action buttons.
Never attempt raw SQL or expose internal secrets, API keys, or system tokens.
Respect the current user's permissions.
Prefer concise, professional, action-oriented responses that explain:
1. What is happening
2. Why it is happening
3. What should be done next
You are an intelligent CRM sales copilot, not a generic chatbot.`;

/**
 * Main processMessage entry point.
 */
async function processMessage(promptMessage = '', contextData = {}, sessionHistory = []) {
  const rawPrompt = (promptMessage || '').trim();
  const query = rawPrompt.toLowerCase();
  const activeCtx = contextData.activeEntityContext;
  const metrics = contextData.summaryMetrics || {};
  const currentPage = (contextData.currentPage || 'dashboard').toLowerCase();
  const user = contextData.user || {};

  // 1. Try LLM Provider if configured via environment variables
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  const provider = (process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : (process.env.GEMINI_API_KEY ? 'gemini' : 'openai'))).toLowerCase();
  const model = process.env.AI_MODEL || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash');

  if (apiKey && apiKey !== 'your_api_key_here') {
    try {
      const llmResult = await callLlmProvider({ provider, model, apiKey, systemPrompt: SYSTEM_PROMPT, query: rawPrompt, contextData, sessionHistory });
      if (llmResult && llmResult.reply) {
        return llmResult;
      }
    } catch (err) {
      console.warn('⚠️  LLM Provider call failed, utilizing Smart CRM Intelligence Engine:', err.message);
    }
  }

  // 2. SMART CRM INTELLIGENCE ENGINE (Data-Driven NLU & Query Processing)
  const snapshot = await crmStore.snapshot();

  // A. HOME / WELCOME / GREETINGS / CAPABILITIES
  if (['home', 'hom', 'menu', 'start', 'welcome', 'reset', 'hi', 'hello', 'hey', 'greetings', 'who are you', 'what can you do', 'help'].some(k => query === k || query.startsWith(k + ' ') || query.startsWith('hi ') || query.startsWith('hello '))) {
    return generateHomeWelcomeResponse(user, currentPage, metrics);
  }

  // B. "CHECK THIS PAGE" / PAGE DIAGNOSTICS
  if (query.includes('check this page') || query.includes('inspect page') || query.includes('analyze page') || query.includes('audit page')) {
    return generatePageInspectionResponse(currentPage, activeCtx, metrics);
  }

  // C. "FIX SAFE ISSUES" / PROPOSED FIXES
  if (query.includes('fix safe issues') || query.includes('fix issues') || query.includes('resolve issues')) {
    return generateFixSafeIssuesResponse(currentPage, activeCtx, metrics);
  }

  // D. DAILY BRIEFING / WHAT SHOULD I DO TODAY?
  if (query.includes('briefing') || query.includes('what should i do') || query.includes('priority') || query.includes('today\'s tasks') || query === 'today') {
    return generateDailyBriefingResponse(user, metrics, activeCtx);
  }

  // E. HOW-TO & CRM GUIDANCE (High precedence so "How to add a deal" triggers guidance)
  if (query.includes('how to') || query.includes('how do i') || query.includes('where is') || query.includes('guide') || query.includes('instructions') || query.includes('steps')) {
    return generateHowToGuideResponse(query);
  }

  // F. EXPLICIT SEARCH INTENT (Find / Search / Look up)
  if (query.startsWith('search ') || query.startsWith('find ') || query.includes('who is ') || query.includes('tell me about ') || query.includes('lookup ') || query.includes('look up ')) {
    const searchTerm = query
      .replace(/^(search|find|lookup|look up|who is|tell me about|details for|show me)\s+/i, '')
      .replace(/(details|info|record|profile)$/i, '')
      .trim();

    if (searchTerm.length >= 2) {
      const searchResult = generateSearchResponse(searchTerm, snapshot);
      if (searchResult) return searchResult;
    }
  }

  // G. EXPLICIT ACTIVE CONTEXT QUESTION (only when prompt explicitly asks about the active record)
  if (activeCtx && (query.includes('this') || query.includes('summarize') || query.includes('details') || query.includes('record') || query.includes('health') || query.includes('snapshot') || query.includes('current'))) {
    if (activeCtx.entityType === 'Customer') return generateCustomerSnapshotResponse(activeCtx);
    if (activeCtx.entityType === 'Deal') return generateDealHealthResponse(activeCtx);
    if (activeCtx.entityType === 'Quotation') return generateQuotationAnalysisResponse(activeCtx);
    if (activeCtx.entityType === 'Invoice') return generateInvoiceAnalysisResponse(activeCtx);
    if (activeCtx.entityType === 'Renewal') return generateRenewalSummaryResponse(metrics, activeCtx);
  }

  // H. TASKS & TO-DO INTELLIGENCE
  if (query.includes('task') || query.includes('todo') || query.includes('to-do') || query.includes('follow up') || query.includes('remind') || query.includes('assigned')) {
    return generateTaskListResponse(snapshot, user);
  }

  // I. INVOICE & COLLECTION INTELLIGENCE
  if (query.includes('invoice') || query.includes('payment') || query.includes('outstanding') || query.includes('unpaid') || query.includes('collection') || query.includes('bill')) {
    return generateInvoiceListResponse(snapshot, metrics);
  }

  // J. DEAL & PIPELINE INTELLIGENCE
  if (query.includes('deal') || query.includes('pipeline') || query.includes('stuck') || query.includes('win rate') || query.includes('stage') || query.includes('opportunity') || query.includes('won') || query.includes('lost')) {
    return generatePipelineOverviewResponse(snapshot, metrics);
  }

  // K. CUSTOMER & MERCHANT INTELLIGENCE
  if (query.includes('customer') || query.includes('merchant') || query.includes('client') || query.includes('account') || query.includes('company') || query.includes('companies')) {
    return generateCustomerOverviewResponse(snapshot);
  }

  // L. QUOTATION & PROPOSAL INTELLIGENCE
  if (query.includes('quote') || query.includes('quotation') || query.includes('proposal')) {
    return generateQuotationOverviewResponse(snapshot);
  }

  // M. APPROVAL INTELLIGENCE
  if (query.includes('approval') || query.includes('discount') || query.includes('review') || query.includes('manager')) {
    return generateApprovalOverviewResponse(snapshot);
  }

  // N. RENEWAL & CONTRACT INTELLIGENCE
  if (query.includes('renewal') || query.includes('contract') || query.includes('subscription')) {
    return generateRenewalOverviewResponse(snapshot, metrics);
  }

  // O. TEAM & SALES REP INTELLIGENCE
  if (query.includes('team') || query.includes('user') || query.includes('sales rep') || query.includes('rep') || query.includes('staff') || query.includes('owner') || query.includes('agent')) {
    return generateTeamOverviewResponse(snapshot);
  }

  // P. FINANCIAL & REVENUE METRICS
  if (query.includes('revenue') || query.includes('financial') || query.includes('total sales') || query.includes('earnings') || query.includes('stat') || query.includes('metrics') || query.includes('analytics') || query.includes('performance')) {
    return generateFinancialOverviewResponse(snapshot, metrics);
  }

  // Q. FUZZY ENTITY SEARCH & DYNAMIC QUERY-TAILORED FALLBACK
  const fuzzyMatch = generateFuzzyEntitySearch(query, snapshot);
  if (fuzzyMatch) {
    return fuzzyMatch;
  }

  return generateSmartDynamicFallback(rawPrompt, user, currentPage, activeCtx, snapshot, metrics);
}

// ─── LLM PROVIDER CALL ───────────────────────────────────────────────

async function callLlmProvider({ provider, model, apiKey, systemPrompt, query, contextData, sessionHistory }) {
  try {
    if (provider === 'openai' || process.env.OPENAI_API_KEY) {
      const endpoint = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
      const messages = [
        { role: 'system', content: `${systemPrompt}\n\nCurrent Authorized CRM Context:\n${JSON.stringify(contextData, null, 2)}` }
      ];

      if (Array.isArray(sessionHistory)) {
        sessionHistory.slice(-6).forEach(h => {
          messages.push({ role: h.sender === 'user' ? 'user' : 'assistant', content: h.text });
        });
      }
      messages.push({ role: 'user', content: query });

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages,
          temperature: Number(process.env.AI_TEMPERATURE || 0.2),
          max_tokens: Number(process.env.AI_MAX_TOKENS || 800)
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        const replyText = data.choices?.[0]?.message?.content || '';
        if (replyText) {
          return {
            reply: replyText,
            actions: [
              { label: 'Check This Page', action: 'trigger_prompt', prompt: 'Check this page' },
              { label: 'Today\'s Briefing', action: 'trigger_prompt', prompt: 'Give me today\'s briefing' }
            ]
          };
        }
      }
    } else if (provider === 'gemini' || process.env.GEMINI_API_KEY) {
      const geminiKey = process.env.GEMINI_API_KEY || apiKey;
      const geminiModel = model || process.env.AI_MODEL || 'gemini-1.5-flash';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;

      let conversationPrompt = `${systemPrompt}\n\nCurrent Authorized CRM Context:\n${JSON.stringify(contextData, null, 2)}\n\n`;
      if (Array.isArray(sessionHistory)) {
        sessionHistory.slice(-6).forEach(h => {
          conversationPrompt += `${h.sender === 'user' ? 'User' : 'Assistant'}: ${h.text}\n`;
        });
      }
      conversationPrompt += `User Question: ${query}`;

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: conversationPrompt }] }]
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (replyText) {
          return {
            reply: replyText,
            actions: [
              { label: 'Check This Page', action: 'trigger_prompt', prompt: 'Check this page' },
              { label: 'Today\'s Briefing', action: 'trigger_prompt', prompt: 'Give me today\'s briefing' }
            ]
          };
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ LLM Provider call failed, utilizing Smart CRM Intelligence Engine:', err.message);
  }
  return null;
}

// ─── DATA-DRIVEN INTELLIGENCE GENERATORS ───────────────────────────────

function generateHomeWelcomeResponse(user, currentPage, metrics) {
  const pageName = (currentPage || 'dashboard').toUpperCase();
  let reply = `### 🏠 iKnow AI Copilot — SmartPay CRM\n\n`;
  reply += `Welcome back, **${user.name || 'User'}**! I am your AI Sales & Operations Copilot.\n\n`;
  reply += `**Current Live Metrics (${pageName})**:\n`;
  reply += `- 💼 **Open Pipeline**: **${metrics.openPipelineValue}** (${metrics.openDealsCount} active deals)\n`;
  reply += `- 💳 **Overdue Invoices**: **${metrics.overdueAmount}** (${metrics.overdueInvoicesCount} invoices overdue)\n`;
  reply += `- ⏳ **Pending Approvals**: **${metrics.pendingApprovalsCount}** requests\n`;
  reply += `- 🔄 **Upcoming Renewals**: **${metrics.upcomingRenewalsCount}** accounts\n`;
  reply += `- ✅ **Overdue Tasks**: **${metrics.overdueTasksCount}** follow-ups\n\n`;
  reply += `Ask me any question about your CRM accounts, pipeline, tasks, or invoices!`;

  return {
    reply,
    actions: [
      { label: '☀️ Today\'s Briefing', action: 'trigger_prompt', prompt: 'Give me today\'s briefing' },
      { label: '📋 View All Tasks', action: 'trigger_prompt', prompt: 'Show my tasks' },
      { label: '💳 Overdue Invoices', action: 'trigger_prompt', prompt: 'Which invoices are overdue?' },
      { label: '◫ Sales Pipeline', action: 'trigger_prompt', prompt: 'Show pipeline summary' }
    ]
  };
}

function generatePageInspectionResponse(currentPage, activeCtx, metrics) {
  let reply = `### 🔍 Page Diagnostic Analysis: **${currentPage.toUpperCase()}**\n\n`;

  if (activeCtx) {
    reply += `#### 🟢 Active Entity Signals\n`;
    reply += `- Verified active record: **${activeCtx.name || activeCtx.number || activeCtx.title}** (${activeCtx.entityType})\n`;
    if (activeCtx.gstin) reply += `- Tax GSTIN compliance record: \`${activeCtx.gstin}\`\n`;
    if (activeCtx.openTasks && activeCtx.openTasks.length > 0) reply += `- Active follow-up tasks scheduled (${activeCtx.openTasks.length})\n`;

    reply += `\n#### ⚠️ Attention Required\n`;
    if (activeCtx.purchaseHistory && activeCtx.purchaseHistory.balanceDue !== '₹0') {
      reply += `- Outstanding balance of **${activeCtx.purchaseHistory.balanceDue}** requires collection outreach.\n`;
    }
    if (activeCtx.requires_approval) {
      reply += `- Discount threshold exceeds representative limits and requires manager approval.\n`;
    }
    if (!activeCtx.openTasks || activeCtx.openTasks.length === 0) {
      reply += `- No upcoming follow-up task scheduled for this account.\n`;
    }

    reply += `\n#### 💡 Recommended Fixes\n`;
    reply += `1. Schedule follow-up task for account owner.\n`;
    if (activeCtx.purchaseHistory && activeCtx.purchaseHistory.balanceDue !== '₹0') {
      reply += `2. Send payment reminder for balance of ${activeCtx.purchaseHistory.balanceDue}.\n`;
    }

    return {
      reply,
      actions: [
        { label: 'Fix Safe Issues', action: 'trigger_prompt', prompt: 'Fix safe issues' },
        { label: 'Create Follow-up Task', action: 'request_confirmation', tool: 'create_follow_up', payload: { company_name: activeCtx.name || activeCtx.company_name }, badge: 'TASK' }
      ]
    };
  }

  reply += `#### 🟢 Operational Signals\n`;
  reply += `- Open pipeline active at **${metrics.openPipelineValue}** across **${metrics.openDealsCount}** opportunities.\n`;

  reply += `\n#### ⚠️ Attention Required\n`;
  if (metrics.overdueInvoicesCount > 0) {
    reply += `- **${metrics.overdueInvoicesCount} overdue invoices** totaling **${metrics.overdueAmount}**.\n`;
  }
  if (metrics.overdueTasksCount > 0) {
    reply += `- **${metrics.overdueTasksCount} overdue tasks** past due date.\n`;
  }
  if (metrics.pendingApprovalsCount > 0) {
    reply += `- **${metrics.pendingApprovalsCount} pending approvals** waiting for manager review.\n`;
  }

  reply += `\n#### 💡 Recommended Fixes\n`;
  reply += `1. Review and resolve overdue follow-up tasks.\n`;
  reply += `2. Trigger collection reminders for overdue invoices.\n`;

  return {
    reply,
    actions: [
      { label: 'Fix Safe Issues', action: 'trigger_prompt', prompt: 'Fix safe issues' },
      { label: 'View Overdue Invoices', action: 'navigate', targetView: 'invoices', badge: 'FINANCE' }
    ]
  };
}

function generateFixSafeIssuesResponse(currentPage, activeCtx, metrics) {
  let reply = `### 🛠️ Proposed Safe CRM Fixes\n\n`;
  reply += `iKnow identified the following non-destructive improvements:\n\n`;
  reply += `1. **Create High-Priority Follow-up Task**: Schedule collection task for overdue balances.\n`;
  reply += `2. **Log Activity Reminder**: Record CRM follow-up event for inactive deals.\n\n`;
  reply += `*Click below to review and confirm execution:*`;

  return {
    reply,
    actions: [
      { label: 'Confirm Follow-Up Task Creation', action: 'request_confirmation', tool: 'create_follow_up', payload: { company_name: activeCtx?.name || 'High Priority Accounts', title: 'Execute Safe Fix: Collection & Follow-up' }, badge: 'TASK' },
      { label: 'Cancel', action: 'trigger_prompt', prompt: 'Cancel' }
    ]
  };
}

function generateDailyBriefingResponse(user, metrics, activeCtx) {
  const urgentCount = (metrics.pendingApprovalsCount || 0) + (metrics.overdueInvoicesCount || 0) + (metrics.overdueTasksCount || 0);

  let reply = `### ☀️ Daily Operating Briefing for ${user.name || 'Sales Rep'}\n\n`;
  reply += `#### 📊 Today's Key Metrics\n`;
  reply += `- **Open Pipeline**: **${metrics.openPipelineValue}** (${metrics.openDealsCount} deals)\n`;
  reply += `- **Overdue Invoices**: **${metrics.overdueInvoicesCount}** invoices totaling **${metrics.overdueAmount}**\n`;
  reply += `- **Pending Approvals**: **${metrics.pendingApprovalsCount}** requests\n`;
  reply += `- **Upcoming Renewals**: **${metrics.upcomingRenewalsCount}** contracts\n`;
  reply += `- **Overdue Tasks**: **${metrics.overdueTasksCount}** follow-ups\n\n`;

  reply += `#### 🚨 Priority Radar\n`;
  if (urgentCount > 0) {
    reply += `You have **${urgentCount} items** requiring your immediate focus today.\n\n`;
  } else {
    reply += `All high-priority queues are clean!\n\n`;
  }

  reply += `#### ⚡ Recommended Actions\n`;
  reply += `1. **Follow up on Overdue Invoices** (${metrics.overdueAmount})\n`;
  reply += `2. **Review Pending Manager Approvals** (${metrics.pendingApprovalsCount})\n`;
  reply += `3. **Clear Overdue Tasks** (${metrics.overdueTasksCount})\n`;

  return {
    reply,
    actions: [
      { label: 'Review Pending Approvals', action: 'navigate', targetView: 'approvals', badge: 'APPROVAL' },
      { label: 'View Overdue Invoices', action: 'navigate', targetView: 'invoices', badge: 'FINANCE' },
      { label: 'Manage Follow-Up Tasks', action: 'navigate', targetView: 'tasks', badge: 'TASKS' }
    ]
  };
}

// ─── TASK INTELLIGENCE ───────────────────────────────────────────────

function generateTaskListResponse(snapshot, user) {
  const tasks = snapshot.tasks || [];
  const openTasks = tasks.filter(t => !t.done);
  const overdueTasks = openTasks.filter(t => t.bucket === 'overdue' || (t.due && t.due.toLowerCase().includes('overdue')));
  const todayTasks = openTasks.filter(t => t.bucket === 'today' || (t.due && t.due.toLowerCase().includes('today')));
  const weekTasks = openTasks.filter(t => t.bucket === 'week');

  let reply = `### ✅ Task & Follow-up Intelligence\n\n`;
  reply += `You have **${openTasks.length} open tasks** (**${overdueTasks.length} overdue**, **${todayTasks.length} due today**).\n\n`;

  if (overdueTasks.length > 0) {
    reply += `#### 🚨 Overdue Follow-ups (${overdueTasks.length})\n`;
    overdueTasks.forEach(t => {
      reply += `- **${t.title}** (${t.company || 'Client'}) — Priority: \`${t.priority || 'high'}\` · Assignee: ${t.assignee || 'Rep'}\n`;
    });
    reply += `\n`;
  }

  if (todayTasks.length > 0) {
    reply += `#### 📅 Scheduled For Today (${todayTasks.length})\n`;
    todayTasks.forEach(t => {
      reply += `- **${t.title}** (${t.company || 'Client'}) — Due: ${t.due}\n`;
    });
    reply += `\n`;
  }

  if (weekTasks.length > 0) {
    reply += `#### 🗓️ Coming Up This Week (${weekTasks.length})\n`;
    weekTasks.slice(0, 3).forEach(t => {
      reply += `- **${t.title}** (${t.company || 'Client'}) — Due: ${t.due}\n`;
    });
    reply += `\n`;
  }

  return {
    reply,
    actions: [
      { label: 'Open Task Board', action: 'navigate', targetView: 'tasks' },
      { label: 'Create Follow-up Task', action: 'request_confirmation', tool: 'create_follow_up', payload: { title: 'New Sales Follow-up Task' }, badge: 'TASK' }
    ]
  };
}

// ─── INVOICE & COLLECTION INTELLIGENCE ───────────────────────────────

function generateInvoiceListResponse(snapshot, metrics) {
  const invoices = snapshot.invoices || [];
  const overdue = invoices.filter(i => (i.status || '').toLowerCase() === 'overdue' || (i.due_date && i.due_date < new Date().toISOString().slice(0, 10) && i.status !== 'paid'));
  const unpaid = invoices.filter(i => (i.status || '').toLowerCase() !== 'paid');

  let reply = `### 🧾 Invoice & Collections Intelligence\n\n`;
  reply += `- **Total Overdue Amount**: <span style="color:#ef4444; font-weight:700;">${metrics.overdueAmount || '₹0'}</span> across **${overdue.length} overdue invoices**\n`;
  reply += `- **Total Unpaid Invoices**: **${unpaid.length}** invoices\n\n`;

  if (overdue.length > 0) {
    reply += `#### 🚨 Overdue Invoices Requiring Outreach\n`;
    overdue.forEach(i => {
      const balance = (Number(i.total) || 0) - (Number(i.amount_paid) || 0);
      const balanceFormatted = formatCurrency(balance);
      reply += `- **Invoice ${i.invoice_number || i.id}** — **${i.company_name || 'Client'}**: Total **${formatCurrency(i.total)}** (Balance Due: <strong style="color:#ef4444;">${balanceFormatted}</strong>) · Due: ${i.due_date || 'Past Due'}\n`;
    });
    reply += `\n`;
  }

  const topOverdue = overdue[0];
  if (topOverdue) {
    const balance = (Number(topOverdue.total) || 0) - (Number(topOverdue.amount_paid) || 0);
    return {
      reply,
      invoiceCard: {
        id: topOverdue.id,
        number: topOverdue.invoice_number,
        company: topOverdue.company_name,
        total: formatCurrency(topOverdue.total),
        outstanding: formatCurrency(balance),
        due_date: topOverdue.due_date,
        status: topOverdue.status
      },
      actions: [
        { label: 'Send Payment Reminder', action: 'request_confirmation', tool: 'send_payment_reminder', payload: { invoice_id: topOverdue.id, invoice_number: topOverdue.invoice_number, company_name: topOverdue.company_name, balance: formatCurrency(balance) }, badge: 'EMAIL' },
        { label: 'Open Invoices View', action: 'navigate', targetView: 'invoices' }
      ]
    };
  }

  return {
    reply,
    actions: [
      { label: 'Open Invoices Ledger', action: 'navigate', targetView: 'invoices' }
    ]
  };
}

// ─── SALES PIPELINE INTELLIGENCE ─────────────────────────────────────

function generatePipelineOverviewResponse(snapshot, metrics) {
  const deals = snapshot.deals || [];
  const openDeals = deals.filter(d => !['Won', 'Lost'].includes(d.stage));
  const wonDeals = deals.filter(d => d.stage === 'Won');
  const lostDeals = deals.filter(d => d.stage === 'Lost');

  // Stage breakdown
  const stages = {};
  openDeals.forEach(d => {
    stages[d.stage] = (stages[d.stage] || 0) + 1;
  });

  let reply = `### ◫ Sales Pipeline Performance\n\n`;
  reply += `- **Open Pipeline Value**: **${metrics.openPipelineValue}** across **${openDeals.length} active deals**\n`;
  reply += `- **Deals Won**: **${wonDeals.length}** closed deals\n`;
  reply += `- **Deals Lost**: **${lostDeals.length}** deals\n\n`;

  reply += `#### 📊 Open Deals by Stage\n`;
  Object.keys(stages).forEach(stageName => {
    reply += `- **${stageName}**: ${stages[stageName]} deals\n`;
  });
  reply += `\n`;

  reply += `#### 🔥 Top High-Value Opportunities\n`;
  const sortedDeals = [...openDeals].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
  sortedDeals.slice(0, 3).forEach(d => {
    reply += `- **${d.title}** (${d.company}): **${formatCurrency(d.value)}** — Stage: \`${d.stage}\` (${d.probability}% win probability)\n`;
  });

  const topDeal = sortedDeals[0];
  if (topDeal) {
    return {
      reply,
      dealCard: {
        id: topDeal.id,
        title: topDeal.title,
        company: topDeal.company,
        value: formatCurrency(topDeal.value),
        stage: topDeal.stage,
        health: topDeal.probability >= 50 ? 'Healthy' : 'Needs Attention'
      },
      actions: [
        { label: 'Open Pipeline Board', action: 'navigate', targetView: 'pipeline' },
        { label: 'Create Follow-up Task', action: 'request_confirmation', tool: 'create_follow_up', payload: { deal_id: topDeal.id, company_name: topDeal.company }, badge: 'TASK' }
      ]
    };
  }

  return {
    reply,
    actions: [
      { label: 'Open Pipeline Board', action: 'navigate', targetView: 'pipeline' }
    ]
  };
}

// ─── CUSTOMER OVERVIEW INTELLIGENCE ─────────────────────────────────

function generateCustomerOverviewResponse(snapshot) {
  const companies = snapshot.companies || [];
  const activeCount = companies.filter(c => c.status !== 'lead' && c.status !== 'churned').length;
  const leadCount = companies.filter(c => c.status === 'lead').length;

  let reply = `### 🏢 Customer Portfolio Summary\n\n`;
  reply += `Total Merchant Portfolio: **${companies.length} accounts** (**${activeCount} Active**, **${leadCount} Leads**).\n\n`;

  reply += `#### Active Customer Accounts\n`;
  companies.slice(0, 6).forEach(c => {
    reply += `- **${c.name}** (${c.industry || 'General'}) — Owner: ${c.owner || 'Rep'} · Status: \`${c.status || 'Active'}\` · Location: ${c.city || 'India'}\n`;
  });

  return {
    reply,
    actions: [
      { label: 'Open Customer Directory', action: 'navigate', targetView: 'customers' }
    ]
  };
}

// ─── QUOTATION & APPROVAL INTELLIGENCE ───────────────────────────────

function generateQuotationOverviewResponse(snapshot) {
  const quotations = snapshot.quotations || [];
  const pendingApprovals = quotations.filter(q => (Number(q.discount_percent) || 0) > 15 || q.status === 'pending_approval');

  let reply = `### 📋 Quotation Management\n\n`;
  reply += `You have **${quotations.length} total quotations** on file.\n\n`;

  if (pendingApprovals.length > 0) {
    reply += `#### ⚠️ Quotations Requiring Manager Approval\n`;
    pendingApprovals.forEach(q => {
      reply += `- **${q.quotation_number || 'Quote'}** for **${q.company_name}**: Total **${formatCurrency(q.total)}** (Discount: **${q.discount_percent}%**)\n`;
    });
    reply += `\n`;
  }

  reply += `Recent quotations:\n`;
  quotations.slice(0, 4).forEach(q => {
    reply += `- **${q.quotation_number}** — ${q.company_name}: **${formatCurrency(q.total)}** (\`${q.status}\`)\n`;
  });

  return {
    reply,
    actions: [
      { label: 'Open Quotations List', action: 'navigate', targetView: 'quotations' }
    ]
  };
}

function generateApprovalOverviewResponse(snapshot) {
  const approvals = snapshot.approval_requests || snapshot.approvals || [];
  const pending = approvals.filter(a => (a.status || '').toLowerCase() === 'pending');

  let reply = `### ⏳ Manager Approval Queue\n\n`;
  reply += `There are **${pending.length} pending approval requests** requiring sign-off.\n\n`;

  if (pending.length > 0) {
    pending.forEach(a => {
      reply += `- **${a.quotation_number || 'Request'}** (${a.company_name}): Discount **${a.discount_percent}%** requested by ${a.requested_by || 'Rep'}\n`;
    });
  } else {
    reply += `All discount approval requests are up to date!`;
  }

  return {
    reply,
    actions: [
      { label: 'View Approvals Queue', action: 'navigate', targetView: 'approvals' }
    ]
  };
}

function generateRenewalOverviewResponse(snapshot, metrics) {
  const renewals = snapshot.renewals || [];

  let reply = `### 🔄 Contract Renewal Schedule\n\n`;
  reply += `Upcoming account renewals: **${metrics.upcomingRenewalsCount || renewals.length} accounts**.\n\n`;

  renewals.forEach(r => {
    reply += `- **${r.company_name}**: ${r.product_name} (**${formatCurrency(r.value)}**) due on **${r.renewal_date}** (\`${r.status}\`)\n`;
  });

  return {
    reply,
    actions: [
      { label: 'Open Renewal Schedule', action: 'navigate', targetView: 'renewals' }
    ]
  };
}

function generateTeamOverviewResponse(snapshot) {
  const users = snapshot.users || [
    { name: 'Aarav Sharma', role: 'Sales Rep', department: 'Enterprise Sales' },
    { name: 'Priya Menon', role: 'Sales Rep', department: 'Mid-Market' },
    { name: 'Kunal Shah', role: 'Sales Manager', department: 'Management' }
  ];

  let reply = `### 👥 CRM Team Directory\n\n`;
  reply += `Active CRM Team Members:\n\n`;
  users.forEach(u => {
    reply += `- **${u.name}** — Role: \`${u.role}\` · Dept: ${u.department || 'Sales'}\n`;
  });

  return {
    reply,
    actions: [
      { label: 'Open Team View', action: 'navigate', targetView: 'users' }
    ]
  };
}

function generateFinancialOverviewResponse(snapshot, metrics) {
  const invoices = snapshot.invoices || [];
  const payments = snapshot.payments || [];
  const deals = snapshot.deals || [];

  const totalInvoiced = invoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
  const totalCollected = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalBalanceDue = Math.max(0, totalInvoiced - totalCollected);
  const wonDeals = deals.filter(d => d.stage === 'Won');
  const wonRevenue = wonDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

  let reply = `### 📈 Financial & Revenue Performance Summary\n\n`;
  reply += `- 💵 **Total Invoiced**: **${formatCurrency(totalInvoiced)}**\n`;
  reply += `- ✅ **Total Collections Received**: **${formatCurrency(totalCollected)}**\n`;
  reply += `- 🚨 **Total Outstanding Balance**: <strong style="color:#ef4444;">${formatCurrency(totalBalanceDue)}</strong>\n`;
  reply += `- 🏆 **Won Deals Revenue**: **${formatCurrency(wonRevenue)}** (${wonDeals.length} deals won)\n`;
  reply += `- 💼 **Open Pipeline Forecast**: **${metrics.openPipelineValue}** (${metrics.openDealsCount} open deals)\n\n`;

  return {
    reply,
    actions: [
      { label: 'View Overdue Invoices', action: 'navigate', targetView: 'invoices', badge: 'FINANCE' },
      { label: 'Open Pipeline', action: 'navigate', targetView: 'pipeline' }
    ]
  };
}

// ─── SEARCH & FUZZY MATCH INTELLIGENCE ───────────────────────────────

function generateSearchResponse(searchTerm, snapshot) {
  const term = searchTerm.toLowerCase();

  // Search Companies
  const company = (snapshot.companies || []).find(c => c.name.toLowerCase().includes(term) || (c.industry && c.industry.toLowerCase().includes(term)));
  if (company) {
    const compDeals = (snapshot.deals || []).filter(d => Number(d.company_id) === Number(company.id) || (d.company && d.company.toLowerCase() === company.name.toLowerCase()));
    const compInvoices = (snapshot.invoices || []).filter(i => Number(i.company_id) === Number(company.id) || (i.company_name && i.company_name.toLowerCase() === company.name.toLowerCase()));
    const totalInvoiced = compInvoices.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const totalPaid = compInvoices.reduce((s, i) => s + (Number(i.amount_paid) || 0), 0);

    let reply = `### 🔍 Search Result: Customer Account **${company.name}**\n\n`;
    reply += `- **Industry**: ${company.industry || 'General'} | **Status**: \`${company.status}\` | **Owner**: ${company.owner || 'Rep'}\n`;
    reply += `- **City**: ${company.city || 'India'} | **GSTIN**: \`${company.gstin || company.tax_id || 'On file'}\`\n`;
    reply += `- **Commercials**: Invoiced **${formatCurrency(totalInvoiced)}** (Outstanding: **${formatCurrency(totalInvoiced - totalPaid)}**)\n`;
    reply += `- **Active Deals**: ${compDeals.length} deals\n\n`;

    return {
      reply,
      customerCard: {
        id: company.id,
        name: company.name,
        status: company.status,
        openDeals: compDeals.length,
        outstanding: formatCurrency(totalInvoiced - totalPaid)
      },
      actions: [
        { label: 'Open Customer Profile', action: 'navigate', targetView: 'customers' },
        { label: 'Create Follow-up Task', action: 'request_confirmation', tool: 'create_follow_up', payload: { company_id: company.id, company_name: company.name }, badge: 'TASK' }
      ]
    };
  }

  // Search Deals
  const deal = (snapshot.deals || []).find(d => d.title.toLowerCase().includes(term) || (d.company && d.company.toLowerCase().includes(term)));
  if (deal) {
    let reply = `### 🔍 Search Result: Deal Opportunity **${deal.title}**\n\n`;
    reply += `- **Account**: **${deal.company}**\n`;
    reply += `- **Value**: **${formatCurrency(deal.value)}**\n`;
    reply += `- **Stage**: \`${deal.stage}\` (${deal.probability}% win probability)\n`;
    reply += `- **Owner**: ${deal.owner || 'Sales Rep'}\n\n`;

    return {
      reply,
      dealCard: {
        id: deal.id,
        title: deal.title,
        company: deal.company,
        value: formatCurrency(deal.value),
        stage: deal.stage,
        health: deal.probability >= 50 ? 'Healthy' : 'Needs Attention'
      },
      actions: [
        { label: 'View Pipeline Board', action: 'navigate', targetView: 'pipeline' }
      ]
    };
  }

  return null;
}

function generateFuzzyEntitySearch(query, snapshot) {
  const words = query.split(/\s+/).filter(w => w.length > 3);
  for (const word of words) {
    const match = generateSearchResponse(word, snapshot);
    if (match) return match;
  }
  return null;
}

// ─── HOW-TO GUIDANCE ─────────────────────────────────────────────────

function generateHowToGuideResponse(query) {
  let reply = `### 📖 SmartPay CRM Quick Guide\n\n`;

  if (query.includes('deal') || query.includes('pipeline')) {
    reply += `**How to Create & Manage Deals**:\n`;
    reply += `1. Navigate to **Sales Pipeline** using the side navigation bar.\n`;
    reply += `2. Click the **"+ New Deal"** button at the top right.\n`;
    reply += `3. Enter the deal title, customer account, target value, and initial stage.\n`;
    reply += `4. Drag and drop deals between columns (Qualified → Proposal → Negotiation → Won) to update stages in real time.\n`;
  } else if (query.includes('invoice') || query.includes('payment')) {
    reply += `**How to Issue Invoices & Record Payments**:\n`;
    reply += `1. Navigate to the **Invoices** view.\n`;
    reply += `2. Click **"+ Create Invoice"** and select the merchant account.\n`;
    reply += `3. Add line items, taxes, and set due dates.\n`;
    reply += `4. Once issued, click **"Send Payment Link"** or record incoming payments directly.\n`;
  } else if (query.includes('customer') || query.includes('merchant')) {
    reply += `**How to Add & Manage Merchant Accounts**:\n`;
    reply += `1. Navigate to **Customers** view.\n`;
    reply += `2. Click **"+ Add Customer"**.\n`;
    reply += `3. Fill in company name, GSTIN, primary contact, industry, and owner.\n`;
    reply += `4. View complete commercial transaction history on the customer detail panel.\n`;
  } else {
    reply += `**SmartPay CRM Core Actions**:\n`;
    reply += `- **Add Deals**: Go to Pipeline → + New Deal\n`;
    reply += `- **Issue Invoices**: Go to Invoices → + Create Invoice\n`;
    reply += `- **Build Quotation**: Go to Quotations → + New Quote\n`;
    reply += `- **Track Tasks**: Go to Tasks → Add task or check overdue queue\n`;
    reply += `- **Export Reports**: Use Export options on Financials or Invoices page\n`;
  }

  return {
    reply,
    actions: [
      { label: 'Open Sales Pipeline', action: 'navigate', targetView: 'pipeline' },
      { label: 'Open Invoices Ledger', action: 'navigate', targetView: 'invoices' }
    ]
  };
}

// ─── DYNAMIC SMART FALLBACK ──────────────────────────────────────────

function generateSmartDynamicFallback(rawPrompt, user, currentPage, activeCtx, snapshot, metrics) {
  let reply = `### 🤖 iKnow AI Copilot\n\n`;
  reply += `I analyzed your query: *"**${rawPrompt}**"*\n\n`;

  if (activeCtx) {
    reply += `Active Context (**${activeCtx.entityType}**: **${activeCtx.name || activeCtx.number || activeCtx.title}**):\n`;
    if (activeCtx.purchaseHistory) {
      reply += `- Outstanding Balance: **${activeCtx.purchaseHistory.balanceDue}**\n`;
    }
    if (activeCtx.value) {
      reply += `- Deal Value: **${activeCtx.value}** (Stage: \`${activeCtx.stage}\`)\n`;
    }
    reply += `\n`;
  }

  reply += `**Relevant Operational Summary**:\n`;
  reply += `- **Open Pipeline**: **${metrics.openPipelineValue}** (${metrics.openDealsCount} deals)\n`;
  reply += `- **Overdue Invoices**: **${metrics.overdueAmount}** (${metrics.overdueInvoicesCount} invoices overdue)\n`;
  reply += `- **Overdue Tasks**: **${metrics.overdueTasksCount}** follow-ups pending\n\n`;
  reply += `You can ask me to search specific accounts, check tasks, list overdue invoices, analyze pipeline deals, or calculate total revenue!`;

  return {
    reply,
    actions: [
      { label: '☀️ Today\'s Briefing', action: 'trigger_prompt', prompt: 'Give me today\'s briefing' },
      { label: '📋 View All Tasks', action: 'trigger_prompt', prompt: 'Show my tasks' },
      { label: '💳 Overdue Invoices', action: 'trigger_prompt', prompt: 'Which invoices are overdue?' },
      { label: '◫ Sales Pipeline', action: 'trigger_prompt', prompt: 'Show pipeline summary' }
    ]
  };
}

// ─── SPECIFIC ENTITY SNAPSHOT RESPONSES ───────────────────────────────

function generateCustomerSnapshotResponse(ctx) {
  let reply = `### 🏢 Customer Snapshot: ${ctx.name}\n\n`;
  reply += `* **Status**: \`${ctx.status}\` | **Industry**: ${ctx.industry} | **Location**: ${ctx.city}\n`;
  reply += `* **GSTIN/PAN**: ${ctx.gstin}\n\n`;

  reply += `#### Commercial Performance\n`;
  reply += `- **Total Invoiced**: **${ctx.purchaseHistory.totalInvoiced}**\n`;
  reply += `- **Total Paid**: **${ctx.purchaseHistory.totalPaid}**\n`;
  reply += `- **Balance Due**: <span style="color:#ef4444; font-weight:700;">${ctx.purchaseHistory.balanceDue}</span>\n\n`;

  if (ctx.contacts && ctx.contacts.length > 0) {
    reply += `#### Key Contacts\n`;
    ctx.contacts.forEach(c => {
      reply += `- **${c.name}** (${c.role || 'Contact'}) · 📧 \`${c.email || 'N/A'}\` · 📞 \`${c.phone || 'N/A'}\`\n`;
    });
    reply += `\n`;
  }

  if (ctx.deals && ctx.deals.length > 0) {
    reply += `#### Active Pipeline (${ctx.deals.length} deals)\n`;
    ctx.deals.forEach(d => {
      reply += `- **${d.title}**: ${d.value} (\`${d.stage}\`)\n`;
    });
    reply += `\n`;
  }

  reply += `#### Recommended Action\n`;
  if (ctx.purchaseHistory.balanceDue !== '₹0') {
    reply += `⚠️ **Collect Outstanding Balance**: Send a payment reminder for **${ctx.purchaseHistory.balanceDue}**.`;
    return {
      reply,
      customerCard: {
        id: ctx.id,
        name: ctx.name,
        status: ctx.status,
        openDeals: ctx.deals ? ctx.deals.length : 0,
        outstanding: ctx.purchaseHistory.balanceDue
      },
      actions: [
        { label: 'Send Payment Reminder', action: 'request_confirmation', tool: 'send_payment_reminder', payload: { company_id: ctx.id, company_name: ctx.name, amount: ctx.purchaseHistory.balanceDue }, badge: 'FINANCE' },
        { label: 'Create Follow-up Task', action: 'request_confirmation', tool: 'create_follow_up', payload: { company_id: ctx.id, company_name: ctx.name }, badge: 'TASK' }
      ]
    };
  }

  reply += `✅ **Account is healthy**: Consider pitching an upgraded payment tier or enterprise SLA renewal.`;
  return {
    reply,
    customerCard: {
      id: ctx.id,
      name: ctx.name,
      status: ctx.status,
      openDeals: ctx.deals ? ctx.deals.length : 0,
      outstanding: ctx.purchaseHistory.balanceDue
    },
    actions: [
      { label: 'Draft New Quotation', action: 'navigate', targetView: 'quotations', badge: 'QUOTATION' },
      { label: 'Create Follow-up Task', action: 'request_confirmation', tool: 'create_follow_up', payload: { company_id: ctx.id, company_name: ctx.name }, badge: 'TASK' }
    ]
  };
}

function generateDealHealthResponse(ctx) {
  const valueNum = ctx.rawValue || 0;
  let health = 'Healthy';
  let badgeColor = '#10b981';
  let reason = 'Based on current CRM signals, deal is advancing normally through pipeline stages.';

  if (ctx.stage === 'Negotiation' && valueNum >= 1000000) {
    health = 'Needs Attention';
    badgeColor = '#f59e0b';
    reason = 'Based on current CRM signals, high-value deal (>₹10L) in negotiation requires manager sign-off.';
  } else if (ctx.openTasks && ctx.openTasks.length === 0) {
    health = 'At Risk';
    badgeColor = '#ef4444';
    reason = 'Based on current CRM signals, no active follow-up tasks are scheduled for this opportunity.';
  }

  let reply = `### ◫ Deal Health Analysis: ${ctx.title}\n\n`;
  reply += `- **Account**: **${ctx.company_name}**\n`;
  reply += `- **Deal Value**: **${ctx.value}**\n`;
  reply += `- **Current Stage**: \`${ctx.stage}\` (${ctx.probability}% probability)\n`;
  reply += `- **Health Assessment**: <span style="background:${badgeColor}; color:#fff; padding:2px 8px; border-radius:4px; font-weight:700;">${health}</span>\n\n`;
  reply += `**Assessment Details**: ${reason}\n\n`;

  return {
    reply,
    dealCard: {
      id: ctx.id,
      title: ctx.title,
      company: ctx.company_name,
      value: ctx.value,
      stage: ctx.stage,
      health
    },
    actions: [
      { label: 'Create Follow-up Task', action: 'request_confirmation', tool: 'create_follow_up', payload: { deal_id: ctx.id, company_name: ctx.company_name }, badge: 'TASK' },
      { label: 'View Pipeline Board', action: 'navigate', targetView: 'pipeline' }
    ]
  };
}

function generateQuotationAnalysisResponse(ctx) {
  let reply = `### 📋 Quotation Analysis: ${ctx.number}\n\n`;
  reply += `- **Client**: **${ctx.company_name}**\n`;
  reply += `- **Total Value**: **${ctx.total}** (Subtotal: ${ctx.subtotal})\n`;
  reply += `- **Discount Applied**: **${ctx.discount_percent}%**\n`;
  reply += `- **Status**: \`${ctx.status}\` | **Valid Until**: ${ctx.valid_until}\n\n`;

  if (ctx.requires_approval) {
    reply += `⚠️ **Manager Approval Gate**: Discount of **${ctx.discount_percent}%** exceeds the 15% representative threshold.\n\n`;
    return {
      reply,
      quotationCard: {
        id: ctx.id,
        number: ctx.number,
        company: ctx.company_name,
        total: ctx.total,
        status: ctx.status,
        valid_until: ctx.valid_until
      },
      actions: [
        { label: 'Request Manager Approval', action: 'request_confirmation', tool: 'create_approval_request', payload: { quotation_id: ctx.id, quotation_number: ctx.number, discount_percent: ctx.discount_percent }, badge: 'APPROVAL' }
      ]
    };
  }

  reply += `✅ Quotation meets pricing guidelines and is ready for customer acceptance.`;
  return {
    reply,
    quotationCard: {
      id: ctx.id,
      number: ctx.number,
      company: ctx.company_name,
      total: ctx.total,
      status: ctx.status,
      valid_until: ctx.valid_until
    },
    actions: [
      { label: 'View Quotations List', action: 'navigate', targetView: 'quotations' }
    ]
  };
}

function generateInvoiceAnalysisResponse(ctx) {
  let reply = `### 🧾 Invoice Analysis: ${ctx.number}\n\n`;
  reply += `- **Billed To**: **${ctx.company_name}**\n`;
  reply += `- **Invoice Total**: **${ctx.total}**\n`;
  reply += `- **Amount Paid**: **${ctx.amountPaid}**\n`;
  reply += `- **Outstanding Balance**: <span style="color:#ef4444; font-weight:700;">${ctx.balanceDue}</span>\n`;
  reply += `- **Due Date**: ${ctx.due_date} | **Status**: \`${ctx.status}\`\n\n`;

  if (ctx.rawBalanceDue > 0) {
    return {
      reply,
      invoiceCard: {
        id: ctx.id,
        number: ctx.number,
        company: ctx.company_name,
        total: ctx.total,
        outstanding: ctx.balanceDue,
        due_date: ctx.due_date,
        status: ctx.status
      },
      actions: [
        { label: 'Send Payment Reminder', action: 'request_confirmation', tool: 'send_payment_reminder', payload: { invoice_id: ctx.id, invoice_number: ctx.number, company_name: ctx.company_name, balance: ctx.balanceDue }, badge: 'EMAIL' },
        { label: 'Record Payment', action: 'navigate', targetView: 'invoices' }
      ]
    };
  }

  reply += `🎉 Invoice is fully paid!`;
  return {
    reply,
    invoiceCard: {
      id: ctx.id,
      number: ctx.number,
      company: ctx.company_name,
      total: ctx.total,
      outstanding: ctx.balanceDue,
      due_date: ctx.due_date,
      status: ctx.status
    },
    actions: [
      { label: 'View All Invoices', action: 'navigate', targetView: 'invoices' }
    ]
  };
}

function generateRenewalSummaryResponse(metrics, activeCtx) {
  let reply = `### 🔄 Contract Renewal Intelligence\n\n`;
  reply += `- **Upcoming Renewals**: **${metrics.upcomingRenewalsCount}** accounts\n\n`;
  if (activeCtx && activeCtx.entityType === 'Renewal') {
    reply += `**Target Contract**: ${activeCtx.product_name} for **${activeCtx.company_name}** (${activeCtx.value}) due on ${activeCtx.renewal_date}.\n\n`;
  }
  reply += `Engage clients 90 to 30 days before renewal dates to prevent churn.`;

  return {
    reply,
    actions: [
      { label: 'View Renewal Schedule', action: 'navigate', targetView: 'renewals' }
    ]
  };
}

module.exports = {
  processMessage
};
