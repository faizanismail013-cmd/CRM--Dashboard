/**
 * SmartPay CRM — iKnow AI Context Service
 * 
 * Generates safe, authorized CRM context objects based on the current page,
 * active entity, logged-in user, and server-side RBAC permissions.
 * Never sends raw database dumps; extracts targeted contextual snapshots.
 */

const crmStore = require('../crm-store');
const { formatINR } = require('../utils/formatters');

function formatCurrency(amount) {
  return formatINR(amount, true);
}

/**
 * Builds authorized context for iKnow AI AGENT based on request metadata.
 */
async function buildAiContext(user = {}, currentPage = 'dashboard', entityType = null, entityId = null) {
  const snapshot = await crmStore.snapshot();
  const userId = user.id || null;
  const userRole = user.role || 'Sales Rep';
  const isAdminOrManager = ['admin', 'Sales Manager'].includes(userRole);

  const companies = snapshot.companies || [];
  const contacts = snapshot.contacts || [];
  const deals = snapshot.deals || [];
  const quotations = snapshot.quotations || [];
  const purchaseOrders = snapshot.purchase_orders || [];
  const invoices = snapshot.invoices || [];
  const payments = snapshot.payments || [];
  const tasks = snapshot.tasks || [];
  const renewals = snapshot.renewals || [];
  const approvals = snapshot.approval_requests || snapshot.approvals || [];
  const notifications = snapshot.notifications || [];

  // Summary Metrics
  const openDeals = deals.filter(d => !['Won', 'Lost'].includes(d.stage));
  const openPipelineValue = openDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  const overdueInvoices = invoices.filter(i => (i.status || '').toLowerCase() === 'overdue' || (i.due_date && i.due_date < new Date().toISOString().slice(0, 10) && i.status !== 'paid'));
  const overdueAmount = overdueInvoices.reduce((sum, i) => sum + ((Number(i.total) || 0) - (Number(i.amount_paid) || 0)), 0);
  const pendingApprovals = approvals.filter(a => (a.status || '').toLowerCase() === 'pending');
  const upcomingRenewals = renewals.filter(r => (r.status || '').toLowerCase() === 'upcoming');
  const overdueTasks = tasks.filter(t => !t.done && (t.bucket === 'overdue' || (t.due_date && t.due_date < new Date().toISOString().slice(0, 10))));

  const contextData = {
    user: {
      id: user.id,
      name: user.name || 'User',
      role: userRole,
      department: user.department || 'Sales'
    },
    currentPage,
    currentEntityType: entityType,
    currentEntityId: entityId,
    summaryMetrics: {
      openDealsCount: openDeals.length,
      openPipelineValue: formatCurrency(openPipelineValue),
      overdueInvoicesCount: overdueInvoices.length,
      overdueAmount: formatCurrency(overdueAmount),
      pendingApprovalsCount: pendingApprovals.length,
      upcomingRenewalsCount: upcomingRenewals.length,
      overdueTasksCount: overdueTasks.length
    },
    activeEntityContext: null
  };

  // Specific Entity Context if viewing a record/modal or page targeting an entity
  if (entityType && entityId) {
    const numericId = Number(entityId);
    switch (entityType.toLowerCase()) {
      case 'company':
      case 'customer': {
        const company = companies.find(c => Number(c.id) === numericId);
        if (company) {
          const compContacts = contacts.filter(c => Number(c.company_id) === numericId);
          const compDeals = deals.filter(d => Number(d.company_id) === numericId);
          const compQuotations = quotations.filter(q => Number(q.company_id) === numericId);
          const compPOs = purchaseOrders.filter(p => Number(p.company_id) === numericId);
          const compInvoices = invoices.filter(i => Number(i.company_id) === numericId);
          const compPayments = payments.filter(p => Number(p.company_id) === numericId);
          const compTasks = tasks.filter(t => Number(t.company_id) === numericId || t.company === company.name);
          const compRenewals = renewals.filter(r => Number(r.company_id) === numericId || r.company_name === company.name);

          const totalPaid = compPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
          const totalInvoiced = compInvoices.reduce((s, i) => s + (Number(i.total) || 0), 0);
          const balanceDue = Math.max(0, totalInvoiced - totalPaid);

          contextData.activeEntityContext = {
            entityType: 'Customer',
            id: company.id,
            name: company.name,
            industry: company.industry || 'General',
            status: company.status || 'Active',
            gstin: company.gstin || company.tax_id || 'Not specified',
            city: company.city || company.address || 'India',
            contactCount: compContacts.length,
            contacts: compContacts.map(c => ({ name: c.name, email: c.email, phone: c.phone, role: c.role })),
            deals: compDeals.map(d => ({ title: d.title, value: formatCurrency(d.value), stage: d.stage })),
            quotations: compQuotations.map(q => ({ number: q.quotation_number, total: formatCurrency(q.total), status: q.status })),
            invoices: compInvoices.map(i => ({ number: i.invoice_number, total: formatCurrency(i.total), status: i.status, due_date: i.due_date })),
            purchaseHistory: {
              totalInvoiced: formatCurrency(totalInvoiced),
              totalPaid: formatCurrency(totalPaid),
              balanceDue: formatCurrency(balanceDue)
            },
            openTasks: compTasks.filter(t => !t.done).map(t => ({ title: t.title, due_date: t.due_date })),
            renewals: compRenewals.map(r => ({ product: r.product_name, date: r.renewal_date, value: formatCurrency(r.value), status: r.status }))
          };
        }
        break;
      }
      case 'deal': {
        const deal = deals.find(d => Number(d.id) === numericId);
        if (deal) {
          const company = companies.find(c => Number(c.id) === Number(deal.company_id));
          const dealQuotations = quotations.filter(q => Number(q.deal_id) === numericId);
          const dealTasks = tasks.filter(t => Number(t.deal_id) === numericId);

          contextData.activeEntityContext = {
            entityType: 'Deal',
            id: deal.id,
            title: deal.title,
            company_name: company?.name || deal.company || '—',
            value: formatCurrency(deal.value),
            rawValue: Number(deal.value) || 0,
            stage: deal.stage,
            probability: deal.probability || 50,
            owner: deal.owner || 'Rep',
            quotations: dealQuotations.map(q => ({ number: q.quotation_number, total: formatCurrency(q.total), status: q.status })),
            openTasks: dealTasks.filter(t => !t.done).map(t => t.title)
          };
        }
        break;
      }
      case 'quotation': {
        const quote = quotations.find(q => Number(q.id) === numericId);
        if (quote) {
          const company = companies.find(c => Number(c.id) === Number(quote.company_id));
          contextData.activeEntityContext = {
            entityType: 'Quotation',
            id: quote.id,
            number: quote.quotation_number,
            company_name: company?.name || quote.company_name || 'Client',
            total: formatCurrency(quote.total),
            subtotal: formatCurrency(quote.subtotal),
            discount_percent: quote.discount_percent || 0,
            status: quote.status,
            valid_until: quote.valid_until || 'N/A',
            requires_approval: (Number(quote.discount_percent) || 0) > 15 || quote.status === 'pending_approval'
          };
        }
        break;
      }
      case 'invoice': {
        const invoice = invoices.find(i => Number(i.id) === numericId);
        if (invoice) {
          const company = companies.find(c => Number(c.id) === Number(invoice.company_id));
          const invPayments = payments.filter(p => Number(p.invoice_id) === numericId);
          const amountPaid = invPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
          const balanceDue = Math.max(0, (Number(invoice.total) || 0) - amountPaid);

          contextData.activeEntityContext = {
            entityType: 'Invoice',
            id: invoice.id,
            number: invoice.invoice_number,
            company_name: company?.name || invoice.company_name || 'Customer',
            total: formatCurrency(invoice.total),
            amountPaid: formatCurrency(amountPaid),
            balanceDue: formatCurrency(balanceDue),
            rawBalanceDue: balanceDue,
            status: invoice.status,
            issue_date: invoice.issue_date,
            due_date: invoice.due_date,
            paymentsCount: invPayments.length
          };
        }
        break;
      }
      case 'renewal': {
        const renewal = renewals.find(r => Number(r.id) === numericId);
        if (renewal) {
          contextData.activeEntityContext = {
            entityType: 'Renewal',
            id: renewal.id,
            company_name: renewal.company_name,
            product_name: renewal.product_name,
            value: formatCurrency(renewal.value),
            renewal_date: renewal.renewal_date,
            status: renewal.status
          };
        }
        break;
      }
    }
  }

  // Page-specific top items context if no specific entity context set
  if (!contextData.activeEntityContext) {
    switch (currentPage.toLowerCase()) {
      case 'customers':
        contextData.pageData = {
          topCustomers: companies.slice(0, 5).map(c => ({ id: c.id, name: c.name, status: c.status, industry: c.industry }))
        };
        break;
      case 'quotations':
        contextData.pageData = {
          pendingQuotes: quotations.filter(q => ['sent', 'draft', 'pending_approval'].includes((q.status || '').toLowerCase())).slice(0, 5).map(q => ({ id: q.id, number: q.quotation_number, company: q.company_name, total: formatCurrency(q.total), status: q.status }))
        };
        break;
      case 'invoices':
        contextData.pageData = {
          overdueInvoices: overdueInvoices.slice(0, 5).map(i => ({ id: i.id, number: i.invoice_number, company: i.company_name, due: i.due_date, balance: formatCurrency((Number(i.total) || 0) - (Number(i.amount_paid) || 0)) }))
        };
        break;
      case 'pipeline':
      case 'deals':
        contextData.pageData = {
          topDeals: openDeals.slice(0, 5).map(d => ({ id: d.id, title: d.title, company: d.company, value: formatCurrency(d.value), stage: d.stage }))
        };
        break;
      case 'renewals':
        contextData.pageData = {
          upcomingRenewals: upcomingRenewals.slice(0, 5).map(r => ({ id: r.id, company: r.company_name, product: r.product_name, date: r.renewal_date, value: formatCurrency(r.value) }))
        };
        break;
    }
  }

  return contextData;
}

module.exports = {
  buildAiContext,
  formatCurrency
};
