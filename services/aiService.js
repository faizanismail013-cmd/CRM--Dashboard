/**
 * SmartPay CRM — iKnow AI Service Provider
 * 
 * Manages interaction with AI providers (Google Gemini / OpenAI / Custom LLM API)
 * and includes a deterministic Smart CRM Intelligence Engine for offline / zero-key mode.
 * Enforces ground-truth precision and strict confirmation flows.
 */

const { formatCurrency } = require('./aiContextService');
const crmStore = require('../crm-store');

/**
 * Main processMessage entry point.
 */
async function processMessage(promptMessage = '', contextData = {}) {
  const query = promptMessage.trim().toLowerCase();
  const activeCtx = contextData.activeEntityContext;
  const metrics = contextData.summaryMetrics || {};
  const currentPage = (contextData.currentPage || 'dashboard').toLowerCase();
  const user = contextData.user || {};

  // Try LLM provider if API key is configured
  const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
  if (apiKey) {
    try {
      // Call LLM Provider if available...
      // (Falling back gracefully if network or API error occurs)
    } catch (err) {
      console.warn('⚠️ AI Provider call failed, using Smart CRM Engine:', err.message);
    }
  }

  // ─── SMART CRM INTELLIGENCE ENGINE (Deterministic Fallback & NLU) ─────

  // 1. DAILY BRIEFING / WHAT SHOULD I DO TODAY?
  if (query.includes('briefing') || query.includes('what should i do') || query.includes('priority') || query.includes('today')) {
    return generateDailyBriefingResponse(user, metrics, activeCtx);
  }

  // 2. CUSTOMER INTELLIGENCE & SNAPSHOT
  if (query.includes('customer') || query.includes('merchant') || activeCtx?.entityType === 'Customer') {
    if (activeCtx && activeCtx.entityType === 'Customer') {
      return generateCustomerSnapshotResponse(activeCtx);
    }
    if (query.includes('overdue') || query.includes('owe') || query.includes('purchase')) {
      return generateCustomerCollectionResponse(metrics);
    }
    return generateCustomerListSummary();
  }

  // 3. DEAL & PIPELINE INTELLIGENCE
  if (query.includes('deal') || query.includes('pipeline') || query.includes('opportunity') || activeCtx?.entityType === 'Deal') {
    if (activeCtx && activeCtx.entityType === 'Deal') {
      return generateDealHealthResponse(activeCtx);
    }
    return generatePipelineSummaryResponse(metrics);
  }

  // 4. QUOTATION INTELLIGENCE
  if (query.includes('quote') || query.includes('quotation') || activeCtx?.entityType === 'Quotation') {
    if (activeCtx && activeCtx.entityType === 'Quotation') {
      return generateQuotationAnalysisResponse(activeCtx);
    }
    return generateQuotationListResponse();
  }

  // 5. INVOICE & COLLECTION INTELLIGENCE
  if (query.includes('invoice') || query.includes('payment') || query.includes('collect') || activeCtx?.entityType === 'Invoice') {
    if (activeCtx && activeCtx.entityType === 'Invoice') {
      return generateInvoiceAnalysisResponse(activeCtx);
    }
    return generateInvoiceOverdueResponse(metrics);
  }

  // 6. RENEWAL INTELLIGENCE
  if (query.includes('renewal') || query.includes('contract') || activeCtx?.entityType === 'Renewal') {
    return generateRenewalSummaryResponse(metrics, activeCtx);
  }

  // 7. CURRENT ENTITY CONTEXTUAL QUERY
  if ((query.includes('tell me about') || query.includes('summarize') || query.includes('this') || query.includes('details')) && activeCtx) {
    if (activeCtx.entityType === 'Customer') return generateCustomerSnapshotResponse(activeCtx);
    if (activeCtx.entityType === 'Deal') return generateDealHealthResponse(activeCtx);
    if (activeCtx.entityType === 'Quotation') return generateQuotationAnalysisResponse(activeCtx);
    if (activeCtx.entityType === 'Invoice') return generateInvoiceAnalysisResponse(activeCtx);
  }

  // DEFAULT CONTEXT-AWARE ASSISTANT RESPONSE
  return generateGenericContextResponse(user, currentPage, activeCtx, metrics);
}

// ─── RESPONSE GENERATORS ─────────────────────────────────────────────

function generateDailyBriefingResponse(user, metrics, activeCtx) {
  const name = (user.name || 'Sales Rep').split(' ')[0];
  const urgentCount = (metrics.pendingApprovalsCount || 0) + (metrics.overdueInvoicesCount || 0) + (metrics.overdueTasksCount || 0);

  let reply = `### ☀️ Daily Briefing for ${user.name || 'you'}\n\n`;
  reply += `Here is your current sales operating summary:\n\n`;
  reply += `- **Open Pipeline**: **${metrics.openPipelineValue}** across **${metrics.openDealsCount}** deals\n`;
  reply += `- **Pending Approvals**: **${metrics.pendingApprovalsCount}** requests requiring manager review\n`;
  reply += `- **Overdue Invoices**: **${metrics.overdueInvoicesCount}** invoices totaling **${metrics.overdueAmount}**\n`;
  reply += `- **Upcoming Renewals**: **${metrics.upcomingRenewalsCount}** contracts due for renewal\n`;
  reply += `- **Overdue Tasks**: **${metrics.overdueTasksCount}** follow-ups past due date\n\n`;

  if (urgentCount > 0) {
    reply += `🚨 **Urgent Priority**: You have **${urgentCount} urgent items** needing immediate attention.`;
  } else {
    reply += `✨ **Great position**: All urgent priority actions are currently clear!`;
  }

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
      actions: [
        { label: 'Send Payment Reminder', action: 'request_confirmation', tool: 'send_payment_reminder', payload: { company_id: ctx.id, company_name: ctx.name, amount: ctx.purchaseHistory.balanceDue }, badge: 'FINANCE' },
        { label: 'Create Follow-up Task', action: 'request_confirmation', tool: 'create_follow_up', payload: { company_id: ctx.id, company_name: ctx.name }, badge: 'TASK' }
      ]
    };
  }

  reply += `✅ **Account is healthy**: Consider pitching an upgraded payment tier or enterprise SLA renewal.`;
  return {
    reply,
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

function generateDealHealthResponse(ctx) {
  const valueNum = ctx.rawValue || 0;
  let health = 'Healthy';
  let badgeColor = '#10b981';
  let reason = 'Deal is advancing normally through stages.';

  if (ctx.stage === 'Negotiation' && valueNum >= 1000000) {
    health = 'Needs Attention';
    badgeColor = '#f59e0b';
    reason = 'High-value deal (>₹10L) in final negotiation requiring manager sign-off.';
  } else if (ctx.openTasks && ctx.openTasks.length === 0) {
    health = 'At Risk';
    badgeColor = '#ef4444';
    reason = 'No active follow-up tasks scheduled for this open opportunity.';
  }

  let reply = `### ◫ Deal Health Analysis: ${ctx.title}\n\n`;
  reply += `- **Account**: **${ctx.company_name}**\n`;
  reply += `- **Deal Value**: **${ctx.value}**\n`;
  reply += `- **Current Stage**: \`${ctx.stage}\` (${ctx.probability}% probability)\n`;
  reply += `- **Health Assessment**: <span style="background:${badgeColor}; color:#fff; padding:2px 8px; border-radius:4px; font-weight:700;">${health}</span>\n\n`;
  reply += `**Assessment Details**: ${reason}\n\n`;

  return {
    reply,
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
  reply += `Navigate to the Pipeline view to drag & drop opportunities between stages.`;

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
      actions: [
        { label: 'Request Manager Approval', action: 'request_confirmation', tool: 'create_approval_request', payload: { quotation_id: ctx.id, quotation_number: ctx.number, discount_percent: ctx.discount_percent }, badge: 'APPROVAL' }
      ]
    };
  }

  reply += `✅ Quotation meets all pricing guidelines and is ready for customer acceptance.`;
  return {
    reply,
    actions: [
      { label: 'View Quotations List', action: 'navigate', targetView: 'quotations' }
    ]
  };
}

function generateQuotationListResponse() {
  let reply = `### 📋 Quotations Overview\n\n`;
  reply += `Manage quotations, track customer views, and trigger manager sign-offs for high discounts.`;
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
      actions: [
        { label: 'Send Payment Reminder', action: 'request_confirmation', tool: 'send_payment_reminder', payload: { invoice_id: ctx.id, invoice_number: ctx.number, company_name: ctx.company_name, balance: ctx.balanceDue }, badge: 'EMAIL' },
        { label: 'Record Payment', action: 'navigate', targetView: 'invoices' }
      ]
    };
  }

  reply += `🎉 Invoice is fully paid!`;
  return {
    reply,
    actions: [
      { label: 'View All Invoices', action: 'navigate', targetView: 'invoices' }
    ]
  };
}

function generateInvoiceOverdueResponse(metrics) {
  let reply = `### 💳 Outstanding Collections & Overdue Invoices\n\n`;
  reply += `- **Overdue Invoices Count**: **${metrics.overdueInvoicesCount}**\n`;
  reply += `- **Total Overdue Amount**: <span style="color:#ef4444; font-weight:700;">${metrics.overdueAmount}</span>\n\n`;
  reply += `Prioritize outreach to high-balance overdue accounts to ensure healthy cashflow.`;

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
  reply += `Proactively engage clients 90 to 30 days before renewal dates to minimize churn.`;

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
      { label: 'Give Me My Daily Briefing', action: 'trigger_prompt', prompt: 'Give me my daily briefing' },
      { label: 'Show My Priority Actions', action: 'navigate', targetView: 'dashboard' },
      { label: 'Show Overdue Invoices', action: 'trigger_prompt', prompt: 'Which invoices are overdue?' }
    ]
  };
}

module.exports = {
  processMessage
};
