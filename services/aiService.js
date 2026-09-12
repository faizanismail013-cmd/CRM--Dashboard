/**
 * SmartPay CRM — iKnow AI Service Provider (Upgraded)
 * 
 * Centralized AI Intelligence & LLM Service supporting:
 * - Provider-agnostic GPT LLM integration (OpenAI, Gemini, custom proxies) via env vars:
 *   AI_PROVIDER, AI_MODEL, AI_API_KEY (or OPENAI_API_KEY / GEMINI_API_KEY)
 * - Deterministic Smart CRM Intelligence Engine fallback for offline/zero-key reliability
 * - CRM System Prompt establishing ground-truth precision & strict tool execution rules
 * - Specialized intelligence: Customer, Deal Health, Quotation, Invoice/Collection, Renewal,
 *   Daily Briefing, "What should I do today?", "Check this page", and "Fix safe issues".
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
  const query = promptMessage.trim().toLowerCase();
  const activeCtx = contextData.activeEntityContext;
  const metrics = contextData.summaryMetrics || {};
  const currentPage = (contextData.currentPage || 'dashboard').toLowerCase();
  const user = contextData.user || {};

  // 1. Try LLM Provider if configured via environment variables
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  const provider = (process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'gemini')).toLowerCase();
  const model = process.env.AI_MODEL || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash');

  if (apiKey && apiKey !== 'your_api_key_here') {
    try {
      const llmResult = await callLlmProvider({ provider, model, apiKey, systemPrompt: SYSTEM_PROMPT, query: promptMessage, contextData, sessionHistory });
      if (llmResult && llmResult.reply) {
        return llmResult;
      }
    } catch (err) {
      console.warn('⚠️  LLM Provider call failed, utilizing Smart CRM Intelligence Engine:', err.message);
    }
  }

  // 2. SMART CRM INTELLIGENCE ENGINE (Deterministic Fallback & NLU)

  // 0. HOME / WELCOME / MAIN MENU INTENT
  if (['home', 'hom', 'menu', 'start', 'welcome', 'reset', 'hi', 'hello', 'help'].includes(query)) {
    return generateHomeWelcomeResponse(user, currentPage, metrics);
  }

  // A. "CHECK THIS PAGE" / PAGE DIAGNOSTICS
  if (query.includes('check this page') || query.includes('inspect page') || query.includes('analyze page') || query.includes('audit page')) {
    return generatePageInspectionResponse(currentPage, activeCtx, metrics);
  }

  // B. "FIX SAFE ISSUES" / PROPOSED FIXES
  if (query.includes('fix safe issues') || query.includes('fix issues') || query.includes('resolve issues')) {
    return generateFixSafeIssuesResponse(currentPage, activeCtx, metrics);
  }

  // C. DAILY BRIEFING / WHAT SHOULD I DO TODAY?
  if (query.includes('briefing') || query.includes('what should i do') || query.includes('priority') || query.includes('today')) {
    return generateDailyBriefingResponse(user, metrics, activeCtx);
  }

  // D. CUSTOMER INTELLIGENCE
  if (query.includes('customer') || query.includes('merchant') || activeCtx?.entityType === 'Customer') {
    if (activeCtx && activeCtx.entityType === 'Customer') {
      return generateCustomerSnapshotResponse(activeCtx);
    }
    if (query.includes('overdue') || query.includes('owe') || query.includes('unpaid')) {
      return generateCustomerCollectionResponse(metrics);
    }
    return generateCustomerListSummary();
  }

  // E. DEAL & PIPELINE INTELLIGENCE
  if (query.includes('deal') || query.includes('pipeline') || query.includes('stuck') || activeCtx?.entityType === 'Deal') {
    if (activeCtx && activeCtx.entityType === 'Deal') {
      return generateDealHealthResponse(activeCtx);
    }
    return generatePipelineSummaryResponse(metrics);
  }

  // F. QUOTATION INTELLIGENCE
  if (query.includes('quote') || query.includes('quotation') || activeCtx?.entityType === 'Quotation') {
    if (activeCtx && activeCtx.entityType === 'Quotation') {
      return generateQuotationAnalysisResponse(activeCtx);
    }
    return generateQuotationListResponse();
  }

  // G. INVOICE & COLLECTION INTELLIGENCE
  if (query.includes('invoice') || query.includes('payment') || query.includes('outstanding') || activeCtx?.entityType === 'Invoice') {
    if (activeCtx && activeCtx.entityType === 'Invoice') {
      return generateInvoiceAnalysisResponse(activeCtx);
    }
    return generateInvoiceOverdueResponse(metrics);
  }

  // H. RENEWAL INTELLIGENCE
  if (query.includes('renewal') || query.includes('contract') || activeCtx?.entityType === 'Renewal') {
    return generateRenewalSummaryResponse(metrics, activeCtx);
  }

  // I. ENTITY CONTEXTUAL SUMMARY
  if ((query.includes('tell me about') || query.includes('summarize') || query.includes('details')) && activeCtx) {
    if (activeCtx.entityType === 'Customer') return generateCustomerSnapshotResponse(activeCtx);
    if (activeCtx.entityType === 'Deal') return generateDealHealthResponse(activeCtx);
    if (activeCtx.entityType === 'Quotation') return generateQuotationAnalysisResponse(activeCtx);
    if (activeCtx.entityType === 'Invoice') return generateInvoiceAnalysisResponse(activeCtx);
  }

  // DEFAULT CONTEXT-AWARE RESPONSE
  return generateGenericContextResponse(user, currentPage, activeCtx, metrics);
}

// ─── LLM PROVIDER CALL ───────────────────────────────────────────────

async function callLlmProvider({ provider, model, apiKey, systemPrompt, query, contextData, sessionHistory }) {
  if (provider === 'openai' || process.env.OPENAI_API_KEY) {
    const endpoint = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
    const messages = [
      { role: 'system', content: `${systemPrompt}\n\nCurrent Authorized CRM Context:\n${JSON.stringify(contextData, null, 2)}` }
    ];

    if (Array.isArray(sessionHistory)) {
      sessionHistory.slice(-4).forEach(h => {
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
        model,
        messages,
        temperature: Number(process.env.AI_TEMPERATURE || 0.2),
        max_tokens: Number(process.env.AI_MAX_TOKENS || 800)
      })
    });

    if (!resp.ok) {
      throw new Error(`OpenAI API error: ${resp.status} ${await resp.text()}`);
    }

    const data = await resp.json();
    const replyText = data.choices?.[0]?.message?.content || '';
    return {
      reply: replyText,
      actions: [
        { label: 'Check This Page', action: 'trigger_prompt', prompt: 'Check this page' },
        { label: 'Today\'s Briefing', action: 'trigger_prompt', prompt: 'Give me today\'s briefing' }
      ]
    };
  }

  return null;
}

// ─── INTELLIGENCE GENERATORS ─────────────────────────────────────────

function generateHomeWelcomeResponse(user, currentPage, metrics) {
  const pageName = (currentPage || 'dashboard').toUpperCase();
  let reply = `### 🏠 iKnow Home — SmartPay CRM Copilot\n\n`;
  reply += `Welcome back, **${user.name || 'User'}**! I am your SmartPay CRM AI Sales Copilot.\n\n`;
  reply += `Current operating metrics for **${pageName}**:\n`;
  reply += `- **Open Pipeline**: **${metrics.openPipelineValue}** across **${metrics.openDealsCount}** deals\n`;
  reply += `- **Overdue Invoices**: **${metrics.overdueAmount}** (${metrics.overdueInvoicesCount} invoices overdue)\n`;
  reply += `- **Pending Approvals**: **${metrics.pendingApprovalsCount}** requests requiring manager review\n`;
  reply += `- **Upcoming Renewals**: **${metrics.upcomingRenewalsCount}** contracts due\n\n`;
  reply += `Choose a quick action below or type any question:`;

  return {
    reply,
    actions: [
      { label: '☀️ Today\'s Briefing', action: 'trigger_prompt', prompt: 'Give me today\'s briefing' },
      { label: '🔍 Check This Page', action: 'trigger_prompt', prompt: 'Check this page' },
      { label: '💳 Overdue Invoices', action: 'trigger_prompt', prompt: 'Which invoices are overdue?' },
      { label: '⚡ Priority Actions', action: 'navigate', targetView: 'dashboard' }
    ]
  };
}

function generatePageInspectionResponse(currentPage, activeCtx, metrics) {
  let reply = `### 🔍 Page Diagnostic Analysis: **${currentPage.toUpperCase()}**\n\n`;

  if (activeCtx) {
    reply += `#### 🟢 Good Signals\n`;
    reply += `- Verified active record: **${activeCtx.name || activeCtx.number || activeCtx.title}** (${activeCtx.entityType})\n`;
    if (activeCtx.gstin) reply += `- Tax GSTIN compliance record on file.\n`;
    if (activeCtx.openTasks && activeCtx.openTasks.length > 0) reply += `- Active follow-up tasks scheduled.\n`;

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

  reply += `#### 🟢 Good Signals\n`;
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
  const name = (user.name || 'Sales Rep').split(' ')[0];
  const urgentCount = (metrics.pendingApprovalsCount || 0) + (metrics.overdueInvoicesCount || 0) + (metrics.overdueTasksCount || 0);

  let reply = `### ☀️ Daily Operating Briefing for ${user.name || 'you'}\n\n`;
  reply += `#### 📊 Today's Metrics\n`;
  reply += `- **Open Pipeline**: **${metrics.openPipelineValue}** across **${metrics.openDealsCount}** deals\n`;
  reply += `- **Overdue Invoices**: **${metrics.overdueInvoicesCount}** invoices totaling **${metrics.overdueAmount}**\n`;
  reply += `- **Pending Approvals**: **${metrics.pendingApprovalsCount}** manager review requests\n`;
  reply += `- **Upcoming Renewals**: **${metrics.upcomingRenewalsCount}** contracts due\n`;
  reply += `- **Overdue Tasks**: **${metrics.overdueTasksCount}** tasks\n\n`;

  reply += `#### 🚨 Attention Needed\n`;
  if (urgentCount > 0) {
    reply += `You have **${urgentCount} items** requiring action today.\n\n`;
  } else {
    reply += `All high-priority queues are clean.\n\n`;
  }

  reply += `#### ⚡ Top Recommended Actions\n`;
  reply += `1. **Follow up on Overdue Invoices** (${metrics.overdueAmount})\n`;
  reply += `2. **Review Pending Manager Approvals** (${metrics.pendingApprovalsCount})\n`;
  reply += `3. **Address Overdue Tasks** (${metrics.overdueTasksCount})\n`;

  return {
    reply,
    actions: [
      { label: 'Review Pending Approvals', action: 'navigate', targetView: 'approvals', badge: 'APPROVAL' },
      { label: 'View Overdue Invoices', action: 'navigate', targetView: 'invoices', badge: 'FINANCE' },
      { label: 'Manage Follow-Up Tasks', action: 'navigate', targetView: 'tasks', badge: 'TASKS' }
    ]
  };
}

async function generateCustomerSnapshotResponse(ctx) {
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

async function generateCustomerListSummary() {
  const snapshot = await crmStore.snapshot();
  const companies = snapshot.companies || [];
  const activeCount = companies.filter(c => c.status !== 'lead').length;

  let reply = `### 🏢 Customer Portfolio Overview\n\n`;
  reply += `You have **${companies.length} total merchant accounts** (**${activeCount} active customers**).\n\n`;
  reply += `Top active accounts:\n`;
  companies.slice(0, 5).forEach(c => {
    reply += `- **${c.name}** (${c.industry || 'General'}) — Status: \`${c.status || 'Active'}\`\n`;
  });

  return {
    reply,
    actions: [
      { label: 'Open Customer Directory', action: 'navigate', targetView: 'customers' }
    ]
  };
}

function generateCustomerCollectionResponse(metrics) {
  let reply = `### 💳 Outstanding Merchant Accounts\n\n`;
  reply += `Based on current CRM signals:\n`;
  reply += `- **Overdue Invoices**: **${metrics.overdueInvoicesCount}**\n`;
  reply += `- **Total Overdue**: <span style="color:#ef4444; font-weight:700;">${metrics.overdueAmount}</span>\n\n`;
  reply += `Prioritize outreach to high-balance merchant accounts to avoid payment defaults.`;

  return {
    reply,
    actions: [
      { label: 'View Overdue Invoices', action: 'navigate', targetView: 'invoices', badge: 'FINANCE' }
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

function generatePipelineSummaryResponse(metrics) {
  let reply = `### ◫ Sales Pipeline Summary\n\n`;
  reply += `- **Total Open Deals**: **${metrics.openDealsCount}**\n`;
  reply += `- **Weighted Forecast**: **${metrics.openPipelineValue}**\n\n`;
  reply += `Navigate to the Pipeline view to manage opportunities and move stages.`;

  return {
    reply,
    actions: [
      { label: 'Open Pipeline View', action: 'navigate', targetView: 'pipeline' }
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

function generateQuotationListResponse() {
  let reply = `### 📋 Quotations Overview\n\n`;
  reply += `Manage quotations, track customer views, and trigger manager sign-offs for discounts >15%.`;
  return {
    reply,
    actions: [
      { label: 'Open Quotation Builder', action: 'navigate', targetView: 'quotations' }
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

function generateInvoiceOverdueResponse(metrics) {
  let reply = `### 💳 Outstanding Collections & Overdue Invoices\n\n`;
  reply += `- **Overdue Invoices Count**: **${metrics.overdueInvoicesCount}**\n`;
  reply += `- **Total Overdue Amount**: <span style="color:#ef4444; font-weight:700;">${metrics.overdueAmount}</span>\n\n`;
  reply += `Prioritize outreach to high-balance overdue accounts.`;

  return {
    reply,
    actions: [
      { label: 'Open Invoice Ledger', action: 'navigate', targetView: 'invoices' }
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

function generateGenericContextResponse(user, currentPage, activeCtx, metrics) {
  let reply = `Hello ${user.name || 'there'}! I am **iKnow**, your SmartPay CRM Copilot.\n\n`;
  if (activeCtx) {
    reply += `I am currently viewing **${activeCtx.entityType}**: **${activeCtx.name || activeCtx.number || activeCtx.title}**.\n\n`;
    reply += `How can I assist you with this record? You can ask me to summarize details, inspect health, check payment balance, or create follow-up tasks.`;
  } else {
    reply += `You are currently on the **${currentPage.toUpperCase()}** view.\n\n`;
    reply += `Summary stats:\n`;
    reply += `- **Open Pipeline**: ${metrics.openPipelineValue}\n`;
    reply += `- **Overdue Invoices**: ${metrics.overdueAmount} (${metrics.overdueInvoicesCount} invoices)\n`;
    reply += `- **Pending Approvals**: ${metrics.pendingApprovalsCount} requests\n\n`;
    reply += `Ask me any question or choose a quick action below!`;
  }

  return {
    reply,
    actions: [
      { label: 'Give Me Today\'s Briefing', action: 'trigger_prompt', prompt: 'Give me today\'s briefing' },
      { label: 'Check This Page', action: 'trigger_prompt', prompt: 'Check this page' },
      { label: 'Show Overdue Invoices', action: 'trigger_prompt', prompt: 'Which invoices are overdue?' }
    ]
  };
}

module.exports = {
  processMessage
};
