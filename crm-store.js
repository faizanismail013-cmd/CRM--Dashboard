/**
 * SmartPay CRM — CRM Data Repository (Enhanced)
 * In-process repository with async API, pagination, search, and DB support.
 * The public API is intentionally asynchronous so it can be replaced by a
 * database repository without changing routes or clients.
 */

const clone = value => JSON.parse(JSON.stringify(value));

const data = {
  companies: [
    { id: 1, name: 'RazorpayX Partners', initial: 'R', logo: 'purple-logo', industry: 'Fintech', owner: 'Aarav Sharma', status: 'active', deals: 2, activity: 'Today, 10:40 AM', created: 8, tags: ['high value'], website: 'razorpay.com', phone: '+91 80 4567 8900', city: 'Bengaluru', employee_count: '201-500' },
    { id: 2, name: 'Urban Company', initial: 'U', logo: 'logo-cyan', industry: 'SaaS', owner: 'Aarav Sharma', status: 'active', deals: 1, activity: 'Today, 9:15 AM', created: 5, tags: ['at risk'], website: 'urbancompany.com', city: 'Gurugram', employee_count: '1001-5000' },
    { id: 3, name: 'Groww Wealth', initial: 'G', logo: 'logo-blue', industry: 'Fintech', owner: 'Priya Menon', status: 'lead', deals: 1, activity: 'Yesterday', created: 12, tags: ['high value'], website: 'groww.in', city: 'Bengaluru', employee_count: '501-1000' },
    { id: 4, name: 'Practo Health', initial: 'P', logo: 'logo-orange', industry: 'Healthcare', owner: 'Kunal Shah', status: 'lead', deals: 1, activity: '28 Aug', created: 2, tags: ['referral'], website: 'practo.com', city: 'Bengaluru', employee_count: '501-1000' },
    { id: 5, name: 'Meesho Retail', initial: 'M', logo: 'logo-green', industry: 'Retail', owner: 'Aarav Sharma', status: 'active', deals: 2, activity: '26 Aug', created: 3, tags: ['high value'], website: 'meesho.com', city: 'Bengaluru', employee_count: '1001-5000' },
    { id: 6, name: 'Niyo Solutions', initial: 'N', logo: 'purple-logo', industry: 'Fintech', owner: 'Priya Menon', status: 'lead', deals: 1, activity: '24 Aug', created: 9, tags: [], website: 'goniyo.com', city: 'Bengaluru', employee_count: '51-200' },
    { id: 7, name: 'Licious Foods', initial: 'L', logo: 'logo-orange', industry: 'Retail', owner: 'Kunal Shah', status: 'active', deals: 0, activity: '21 Aug', created: 4, tags: ['referral'], website: 'licious.in', city: 'Bengaluru', employee_count: '201-500' },
    { id: 8, name: 'CleverTap', initial: 'C', logo: 'logo-blue', industry: 'SaaS', owner: 'Aarav Sharma', status: 'churned', deals: 0, activity: '12 Aug', created: 7, tags: ['at risk'], website: 'clevertap.com', city: 'Mumbai', employee_count: '501-1000' }
  ],
  deals: [
    // Open deals
    { id: 1, title: 'Marketplace payouts', company: 'Urban Company', value: 680000, stage: 'New Lead', probability: 10, owner: 'Aarav Sharma', due: 'Sep 24', month: 'September', tag: 'at risk', deal_type: 'new_business' },
    { id: 2, title: 'Payment gateway expansion', company: 'RazorpayX Partners', value: 800000, stage: 'Proposal Sent', probability: 50, owner: 'Aarav Sharma', due: 'Sep 18', month: 'September', tag: 'high value', deal_type: 'new_business' },
    { id: 3, title: 'UPI Autopay upgrade', company: 'RazorpayX Partners', value: 450000, stage: 'Negotiation', probability: 75, owner: 'Aarav Sharma', due: 'Sep 28', month: 'September', tag: 'high value', deal_type: 'upsell' },
    { id: 4, title: 'Merchant onboarding', company: 'Groww Wealth', value: 520000, stage: 'Qualified', probability: 25, owner: 'Priya Menon', due: 'Sep 22', month: 'September', tag: 'high value', deal_type: 'new_business' },
    { id: 5, title: 'Subscription payments', company: 'Meesho Retail', value: 370000, stage: 'Proposal Sent', probability: 50, owner: 'Aarav Sharma', due: 'Oct 05', month: 'October', tag: 'high value', deal_type: 'new_business' },
    { id: 6, title: 'Healthcare collections', company: 'Practo Health', value: 250000, stage: 'Qualified', probability: 25, owner: 'Kunal Shah', due: 'Oct 12', month: 'October', tag: 'referral', deal_type: 'new_business' },
    { id: 7, title: 'Multi-store settlement', company: 'Niyo Solutions', value: 290000, stage: 'New Lead', probability: 10, owner: 'Priya Menon', due: 'Oct 16', month: 'October', tag: '', deal_type: 'new_business' },
    { id: 8, title: 'Express checkout', company: 'Meesho Retail', value: 810000, stage: 'Negotiation', probability: 75, owner: 'Aarav Sharma', due: 'Sep 30', month: 'September', tag: 'high value', deal_type: 'new_business' },
    { id: 9, title: 'Enterprise payouts', company: 'Licious Foods', value: 330000, stage: 'Qualified', probability: 25, owner: 'Kunal Shah', due: 'Oct 20', month: 'October', tag: 'referral', deal_type: 'new_business' },
    // Won deals (current month - September)
    { id: 10, title: 'API integration license', company: 'RazorpayX Partners', value: 540000, stage: 'Won', probability: 100, owner: 'Aarav Sharma', due: 'Sep 5', month: 'September', tag: 'high value', deal_type: 'new_business', won_date: '2026-09-05' },
    { id: 11, title: 'Annual payout plan', company: 'Meesho Retail', value: 720000, stage: 'Won', probability: 100, owner: 'Aarav Sharma', due: 'Sep 8', month: 'September', tag: 'high value', deal_type: 'renewal', won_date: '2026-09-08' },
    { id: 12, title: 'Digital KYC module', company: 'Groww Wealth', value: 380000, stage: 'Won', probability: 100, owner: 'Priya Menon', due: 'Sep 3', month: 'September', tag: 'high value', deal_type: 'new_business', won_date: '2026-09-03' },
    // Won deals (August — last month)
    { id: 13, title: 'Payment link service', company: 'Licious Foods', value: 290000, stage: 'Won', probability: 100, owner: 'Kunal Shah', due: 'Aug 22', month: 'August', tag: 'referral', deal_type: 'new_business', won_date: '2026-08-22' },
    { id: 14, title: 'Checkout SDK renewal', company: 'Urban Company', value: 450000, stage: 'Won', probability: 100, owner: 'Aarav Sharma', due: 'Aug 15', month: 'August', tag: '', deal_type: 'renewal', won_date: '2026-08-15' },
    // Lost deals
    { id: 15, title: 'Payroll integration', company: 'CleverTap', value: 620000, stage: 'Lost', probability: 0, owner: 'Aarav Sharma', due: 'Sep 10', month: 'September', tag: 'at risk', deal_type: 'new_business', lost_reason: 'Budget constraints', lost_date: '2026-09-10' },
    { id: 16, title: 'B2B payment gateway', company: 'Niyo Solutions', value: 340000, stage: 'Lost', probability: 0, owner: 'Priya Menon', due: 'Aug 28', month: 'August', tag: '', deal_type: 'new_business', lost_reason: 'Chose competitor', lost_date: '2026-08-28' },
    { id: 17, title: 'Vendor management suite', company: 'Practo Health', value: 280000, stage: 'Lost', probability: 0, owner: 'Kunal Shah', due: 'Sep 7', month: 'September', tag: '', deal_type: 'new_business', lost_reason: 'Timing / no decision', lost_date: '2026-09-07' }
  ],
  tasks: [
    { id: 1, title: 'Send revised proposal', company: 'Urban Company', due: 'Overdue · Aug 30', bucket: 'overdue', priority: 'high', done: false, assignee: 'Aarav Sharma' },
    { id: 2, title: 'Call Neha about final approval', company: 'RazorpayX Partners', due: 'Today · 2:00 PM', bucket: 'today', priority: 'high', done: false, assignee: 'Aarav Sharma' },
    { id: 3, title: 'Update discovery notes', company: 'Groww Wealth', due: 'Today · 4:30 PM', bucket: 'today', priority: 'medium', done: false, assignee: 'Aarav Sharma' },
    { id: 4, title: 'Share onboarding checklist', company: 'Meesho Retail', due: 'Today · 5:00 PM', bucket: 'today', priority: 'medium', done: false, assignee: 'Aarav Sharma' },
    { id: 5, title: 'Prepare negotiation brief', company: 'RazorpayX Partners', due: 'Tomorrow', bucket: 'week', priority: 'high', done: false, assignee: 'Aarav Sharma' },
    { id: 6, title: 'Schedule demo with finance', company: 'Practo Health', due: 'Wed, Sep 3', bucket: 'week', priority: 'medium', done: false, assignee: 'Kunal Shah' },
    { id: 7, title: 'Review contract amendment', company: 'Groww Wealth', due: 'Thu, Sep 4', bucket: 'week', priority: 'low', done: false, assignee: 'Priya Menon' },
    { id: 8, title: 'Confirm tax setup', company: 'RazorpayX Partners', due: 'Fri, Aug 29', bucket: 'done', priority: 'medium', done: true, assignee: 'Aarav Sharma' },
    { id: 9, title: 'Follow up on proposal review', company: 'Groww Wealth', due: 'Overdue · Sep 8', bucket: 'overdue', priority: 'high', done: false, assignee: 'Priya Menon' },
    { id: 10, title: 'Send pricing comparison', company: 'Practo Health', due: 'Today · 11:00 AM', bucket: 'today', priority: 'high', done: false, assignee: 'Kunal Shah' }
  ],
  contacts: [
    { id: 1, name: 'Neha Agarwal', initials: 'NA', title: 'VP, Partnerships', email: 'neha.agarwal@razorpay.com', phone: '+91 98765 34021', primary: true, company_id: 1, company_name: 'RazorpayX Partners' },
    { id: 2, name: 'Rohan Kulkarni', initials: 'RK', title: 'Director, Finance', email: 'rohan.k@razorpay.com', phone: '+91 98210 14920', primary: false, company_id: 1, company_name: 'RazorpayX Partners' },
    { id: 3, name: 'Maya Singh', initials: 'MS', title: 'Procurement Manager', email: 'maya.singh@razorpay.com', phone: '+91 99234 89070', primary: false, company_id: 1, company_name: 'RazorpayX Partners' },
    { id: 4, name: 'Rahul Mehta', initials: 'RM', title: 'Head of Operations', email: 'rahul.m@urbancompany.com', phone: '+91 98765 12340', primary: true, company_id: 2, company_name: 'Urban Company' },
    { id: 5, name: 'Anita Desai', initials: 'AD', title: 'CFO', email: 'anita.d@groww.in', phone: '+91 98321 56789', primary: true, company_id: 3, company_name: 'Groww Wealth' },
    { id: 6, name: 'Vikram Patel', initials: 'VP', title: 'CTO', email: 'vikram.p@practo.com', phone: '+91 97654 32100', primary: true, company_id: 4, company_name: 'Practo Health' },
    { id: 7, name: 'Sneha Iyer', initials: 'SI', title: 'VP, Payments', email: 'sneha.i@meesho.com', phone: '+91 99876 54321', primary: true, company_id: 5, company_name: 'Meesho Retail' }
  ],
  activities: [
    { id: 1, type: 'call', icon: '☎', text: '<strong>Call with Neha Agarwal</strong> at RazorpayX Partners · Discussed procurement sign-off for the gateway expansion.', time: '20 min ago' },
    { id: 2, type: 'email', icon: '✉', text: '<strong>Sent proposal</strong> to Rahul Mehta at Urban Company · Marketplace payout pricing and rollout plan.', time: '1 hr ago' },
    { id: 3, type: 'meeting', icon: '▣', text: '<strong>Demo meeting completed</strong> with Groww Wealth · Added discovery notes and next steps.', time: 'Yesterday' },
    { id: 4, type: 'note', icon: '▤', text: '<strong>Added account note</strong> for Meesho Retail · Legal review is expected by Thursday.', time: 'Yesterday' },
    { id: 5, type: 'deal', icon: '◫', text: '<strong>Won: API integration license</strong> at RazorpayX Partners · ₹5.4L closed by Aarav Sharma.', time: 'Sep 5' },
    { id: 6, type: 'deal', icon: '◫', text: '<strong>Won: Annual payout plan</strong> at Meesho Retail · ₹7.2L renewal closed by Aarav Sharma.', time: 'Sep 8' }
  ],
  letters: [],
  stages: [
    { name: 'New Lead', probability: 10, color: '#8fa1bb' }, { name: 'Qualified', probability: 25, color: '#38a9b8' },
    { name: 'Proposal Sent', probability: 50, color: '#4c84d9' }, { name: 'Negotiation', probability: 75, color: '#315fba' },
    { name: 'Won', probability: 100, color: '#29a56b' }
  ],
  products: [
    { id: 1, name: 'Payment Gateway License', sku: 'SP-PG-001', description: 'Full-featured payment gateway with multi-currency support', unit_price: 250000, currency: 'INR', category: 'Gateway', is_active: true },
    { id: 2, name: 'UPI Integration Module', sku: 'SP-UPI-001', description: 'UPI Collect, Autopay, and QR code payment integration', unit_price: 150000, currency: 'INR', category: 'Integration', is_active: true },
    { id: 3, name: 'API Access — Enterprise Tier', sku: 'SP-API-003', description: 'Unlimited API calls, dedicated support, SLA guarantee', unit_price: 480000, currency: 'INR', category: 'API', is_active: true },
    { id: 4, name: 'Merchant Onboarding Suite', sku: 'SP-MOS-001', description: 'Digital KYC, sub-merchant management, and compliance tools', unit_price: 320000, currency: 'INR', category: 'Onboarding', is_active: true },
    { id: 5, name: 'Payout & Settlement Engine', sku: 'SP-PAY-001', description: 'Automated bulk payouts, instant settlements, reconciliation', unit_price: 420000, currency: 'INR', category: 'Payout', is_active: true },
    { id: 6, name: 'Checkout SDK', sku: 'SP-CHK-001', description: 'Embeddable checkout widget with smart payment routing', unit_price: 180000, currency: 'INR', category: 'Gateway', is_active: true },
    { id: 7, name: 'Annual Support & Maintenance', sku: 'SP-SUP-001', description: '24/7 priority support, quarterly reviews, uptime SLA', unit_price: 120000, currency: 'INR', category: 'Support', is_active: true },
    { id: 8, name: 'Fraud Detection Add-on', sku: 'SP-FRD-001', description: 'AI-powered fraud detection with real-time risk scoring', unit_price: 280000, currency: 'INR', category: 'Security', is_active: true }
  ],
  quotations: [
    { id: 1, quotation_number: 'QTN-2026-001', deal_id: 2, company_id: 1, contact_id: 1, status: 'sent', valid_until: '2026-09-30', subtotal: 430000, discount_percent: 0, tax_percent: 18, total: 507400, notes: 'Payment gateway expansion — Phase 1', terms: 'Net 30 days from acceptance', created_at: '2026-09-10' },
    { id: 2, quotation_number: 'QTN-2026-002', deal_id: 4, company_id: 3, contact_id: 5, status: 'draft', valid_until: '2026-10-15', subtotal: 520000, discount_percent: 5, tax_percent: 18, total: 582760, notes: 'Merchant onboarding suite for Groww', terms: 'Net 30 days from acceptance', created_at: '2026-09-11' }
  ],
  quotation_items: [
    { id: 1, quotation_id: 1, product_id: 1, description: 'Payment Gateway License', quantity: 1, unit_price: 250000, discount_percent: 0, total: 250000, sort_order: 1 },
    { id: 2, quotation_id: 1, product_id: 6, description: 'Checkout SDK', quantity: 1, unit_price: 180000, discount_percent: 0, total: 180000, sort_order: 2 },
    { id: 3, quotation_id: 2, product_id: 4, description: 'Merchant Onboarding Suite', quantity: 1, unit_price: 320000, discount_percent: 0, total: 320000, sort_order: 1 },
    { id: 4, quotation_id: 2, product_id: 2, description: 'UPI Integration Module', quantity: 1, unit_price: 150000, discount_percent: 0, total: 150000, sort_order: 2 },
    { id: 5, quotation_id: 2, product_id: 7, description: 'Annual Support & Maintenance', quantity: 1, unit_price: 120000, discount_percent: 58.33, total: 50000, sort_order: 3 }
  ],
  purchase_orders: [
    { id: 1, po_number: 'PO-RZP-2026-004', quotation_id: 1, deal_id: 2, company_id: 1, amount: 507400, status: 'verified', issue_date: '2026-09-02', delivery_date: '2026-09-20', notes: 'PO for Payment Gateway expansion' },
    { id: 2, po_number: 'PO-MSH-2026-018', quotation_id: null, deal_id: 8, company_id: 5, amount: 810000, status: 'received', issue_date: '2026-09-08', delivery_date: '2026-10-01', notes: 'Express checkout enterprise module' }
  ],
  invoices: [
    { id: 1, invoice_number: 'INV-2026-001', po_id: 1, quotation_id: 1, deal_id: 2, company_id: 1, contact_id: 1, status: 'paid', issue_date: '2026-09-03', due_date: '2026-09-18', subtotal: 430000, discount_percent: 0, tax_percent: 18, total: 507400, amount_paid: 507400, notes: 'Full payment received via NEFT', terms: 'Net 15 days', created_at: '2026-09-03' },
    { id: 2, invoice_number: 'INV-2026-002', po_id: null, quotation_id: 2, deal_id: 4, company_id: 3, contact_id: 5, status: 'partial', issue_date: '2026-09-05', due_date: '2026-09-25', subtotal: 520000, discount_percent: 5, tax_percent: 18, total: 582760, amount_paid: 300000, notes: 'Advance received; balance on delivery', terms: '50% advance, balance Net 30', created_at: '2026-09-05' },
    { id: 3, invoice_number: 'INV-2026-003', po_id: null, quotation_id: null, deal_id: 1, company_id: 2, contact_id: 4, status: 'overdue', issue_date: '2026-08-15', due_date: '2026-08-30', subtotal: 350000, discount_percent: 0, tax_percent: 18, total: 413000, amount_paid: 0, notes: 'Payment reminder sent to Rahul Mehta', terms: 'Net 15 days', created_at: '2026-08-15' },
    { id: 4, invoice_number: 'INV-2026-004', po_id: 2, quotation_id: null, deal_id: 8, company_id: 5, contact_id: 7, status: 'sent', issue_date: '2026-09-09', due_date: '2026-09-24', subtotal: 686440, discount_percent: 0, tax_percent: 18, total: 810000, amount_paid: 0, notes: 'Express checkout deployment invoice', terms: 'Net 15 days', created_at: '2026-09-09' }
  ],
  invoice_items: [
    { id: 1, invoice_id: 1, product_id: 1, description: 'Payment Gateway License', quantity: 1, unit_price: 250000, discount_percent: 0, total: 250000, sort_order: 1 },
    { id: 2, invoice_id: 1, product_id: 6, description: 'Checkout SDK', quantity: 1, unit_price: 180000, discount_percent: 0, total: 180000, sort_order: 2 },
    { id: 3, invoice_id: 2, product_id: 4, description: 'Merchant Onboarding Suite', quantity: 1, unit_price: 320000, discount_percent: 0, total: 320000, sort_order: 1 },
    { id: 4, invoice_id: 2, product_id: 2, description: 'UPI Integration Module', quantity: 1, unit_price: 150000, discount_percent: 0, total: 150000, sort_order: 2 },
    { id: 5, invoice_id: 2, product_id: 7, description: 'Annual Support & Maintenance', quantity: 1, unit_price: 120000, discount_percent: 58.33, total: 50000, sort_order: 3 },
    { id: 6, invoice_id: 3, product_id: 5, description: 'Payout & Settlement Engine', quantity: 1, unit_price: 350000, discount_percent: 0, total: 350000, sort_order: 1 },
    { id: 7, invoice_id: 4, product_id: 3, description: 'API Access — Enterprise Tier', quantity: 1, unit_price: 480000, discount_percent: 0, total: 480000, sort_order: 1 },
    { id: 8, invoice_id: 4, product_id: 6, description: 'Checkout SDK', quantity: 1, unit_price: 180000, discount_percent: 0, total: 180000, sort_order: 2 },
    { id: 9, invoice_id: 4, product_id: 7, description: 'Annual Support & Maintenance', quantity: 1, unit_price: 26440, discount_percent: 0, total: 26440, sort_order: 3 }
  ],
  payments: [
    { id: 1, payment_number: 'PAY-2026-001', invoice_id: 1, company_id: 1, amount: 507400, payment_date: '2026-09-04', payment_method: 'bank_transfer', reference_number: 'NEFT/HDFC/202609041234', notes: 'Full settlement for INV-2026-001', created_at: '2026-09-04' },
    { id: 2, payment_number: 'PAY-2026-002', invoice_id: 2, company_id: 3, amount: 300000, payment_date: '2026-09-06', payment_method: 'upi', reference_number: 'UPI/GROWW/202609069876', notes: 'Advance tranche 1', created_at: '2026-09-06' }
  ],
  teams: [
    { id: 1, name: 'Enterprise Fintech', manager_id: 1, manager_name: 'Aarav Sharma', description: 'Large enterprise accounts & payment infrastructure', created_at: '2026-08-01' },
    { id: 2, name: 'Commercial SaaS & Retail', manager_id: 2, manager_name: 'Priya Menon', description: 'Mid-market SaaS merchants, D2C retail, healthcare', created_at: '2026-08-01' }
  ],
  commission_rules: [
    { id: 1, name: 'Standard Base Tier', min_attainment_pct: 0, max_attainment_pct: 100, commission_pct: 5.0, bonus_amount: 0, is_active: true },
    { id: 2, name: 'Quota Accelerator Tier', min_attainment_pct: 100.01, max_attainment_pct: 150, commission_pct: 8.0, bonus_amount: 25000, is_active: true },
    { id: 3, name: 'President Club Super Tier', min_attainment_pct: 150.01, max_attainment_pct: 300, commission_pct: 10.0, bonus_amount: 100000, is_active: true }
  ],
  commissions: [
    { id: 1, user_id: 1, rep_name: 'Aarav Sharma', deal_id: 2, invoice_id: 1, deal_amount: 507400, commission_rate: 5.0, commission_amount: 25370, status: 'approved', earned_date: '2026-09-04', paid_date: null, notes: 'Commission earned on INV-2026-001 settlement' },
    { id: 2, user_id: 2, rep_name: 'Priya Menon', deal_id: 4, invoice_id: 2, deal_amount: 300000, commission_rate: 5.0, commission_amount: 15000, status: 'earned', earned_date: '2026-09-06', paid_date: null, notes: 'Tranche 1 commission on Groww Merchant onboarding' },
    { id: 3, user_id: 1, rep_name: 'Aarav Sharma', deal_id: 8, invoice_id: 4, deal_amount: 810000, commission_rate: 8.0, commission_amount: 64800, status: 'earned', earned_date: '2026-09-09', paid_date: null, notes: 'Accelerator tier commission for Express checkout deal' }
  ],
  sales_targets: [
    { id: 1, user_id: 1, rep_name: 'Aarav Sharma', team_id: 1, period_type: 'monthly', period_name: 'September 2026', target_amount: 2000000, created_at: '2026-09-01' },
    { id: 2, user_id: 2, rep_name: 'Priya Menon', team_id: 2, period_type: 'monthly', period_name: 'September 2026', target_amount: 1500000, created_at: '2026-09-01' },
    { id: 3, user_id: 3, rep_name: 'Kunal Shah', team_id: 2, period_type: 'monthly', period_name: 'September 2026', target_amount: 1200000, created_at: '2026-09-01' }
  ],
  leads: [
    { id: 1, name: 'Siddharth Rao', company: 'Orbit D2C Retail', contact_name: 'Siddharth Rao', email: 'siddharth@orbitd2c.com', phone: '+91 98112 34567', source: 'Inbound', industry: 'Retail', owner: 'Aarav Sharma', lead_score: 85, status: 'Qualified', expected_value: 450000, next_followup: '2026-09-18', notes: 'Interested in UPI Autopay and Checkout SDK', created_at: '2026-09-01' },
    { id: 2, name: 'Kavita Verma', company: 'Healthify Tech', contact_name: 'Kavita Verma', email: 'kavita@healthifytech.io', phone: '+91 99001 88223', source: 'Referral', industry: 'Healthcare', owner: 'Priya Menon', lead_score: 65, status: 'Contacted', expected_value: 320000, next_followup: '2026-09-16', notes: 'Requested digital KYC and onboarding compliance specs', created_at: '2026-09-03' },
    { id: 3, name: 'Vikram Sharma', company: 'FinEdge Systems', contact_name: 'Vikram Sharma', email: 'vikram@finedge.in', phone: '+91 97123 44556', source: 'Outbound', industry: 'Fintech', owner: 'Kunal Shah', lead_score: 90, status: 'Proposal', expected_value: 680000, next_followup: '2026-09-15', notes: 'High intent prospect for Payout Engine', created_at: '2026-09-05' }
  ],
  renewals: [
    { id: 1, company_id: 1, company_name: 'RazorpayX Partners', product_id: 1, product_name: 'Payment Gateway License', contract_start: '2025-10-01', contract_end: '2026-10-01', renewal_date: '2026-10-01', value: 800000, owner: 'Aarav Sharma', status: 'Upcoming', notes: 'Annual gateway contract renewal' },
    { id: 2, company_id: 2, company_name: 'Urban Company', product_id: 6, product_name: 'Checkout SDK', contract_start: '2025-11-15', contract_end: '2026-11-15', renewal_date: '2026-11-15', value: 450000, owner: 'Aarav Sharma', status: 'Upcoming', notes: 'SDK annual subscription renewal' }
  ],
  communications: [
    { id: 1, type: 'email', recipient: 'neha.agarwal@razorpay.com', cc: '', bcc: '', subject: 'SmartPay Gateway Expansion Proposal', body_html: '<p>Hi Neha, Please find attached the updated proposal for gateway expansion.</p>', status: 'sent', entity_type: 'company', entity_id: 1, user_id: 1, created_at: '2026-09-10T10:00:00.000Z' }
  ],
  email_templates: [
    { id: 1, name: 'Introduction', subject: 'Introducing SmartPay Payment Solutions for {{company_name}}', category: 'outreach', body_html: '<p>Dear {{contact_name}},</p><p>I noticed {{company_name}} is expanding digital operations. SmartPay offers seamless payment gateway and automated payout infrastructure tailored for your team.</p><p>Best regards,<br/>{{sales_owner}}<br/>SmartPay India</p>', variables: '{{contact_name}}, {{company_name}}, {{sales_owner}}' },
    { id: 2, name: 'Quotation Follow-up', subject: 'Following up on Quotation #{{quotation_number}} for {{company_name}}', category: 'followup', body_html: '<p>Hi {{contact_name}},</p><p>I wanted to check if you had a chance to review Quotation #{{quotation_number}} for {{deal_name}} (Valued at {{deal_value}}).</p><p>Let me know if you need any adjustments.</p><p>Regards,<br/>{{sales_owner}}</p>', variables: '{{contact_name}}, {{quotation_number}}, {{company_name}}, {{deal_name}}, {{deal_value}}, {{sales_owner}}' },
    { id: 3, name: 'Renewal Reminder', subject: 'Upcoming Contract Renewal for {{company_name}} — {{renewal_date}}', category: 'renewal', body_html: '<p>Dear {{contact_name}},</p><p>This is a friendly reminder that your contract for {{company_name}} is due for renewal on <strong>{{renewal_date}}</strong>.</p><p>Please let us know your preferred time to discuss renewal terms.</p><p>Best regards,<br/>{{sales_owner}}</p>', variables: '{{contact_name}}, {{company_name}}, {{renewal_date}}, {{sales_owner}}' }
  ],
  automations: [
    { id: 1, name: 'Proposal Sent -> Schedule Follow-up Task', event: 'deal:stage_change', condition_json: JSON.stringify({ stage: 'Proposal Sent' }), action_json: JSON.stringify({ type: 'create_task', title: 'Follow up on proposal', due_days: 3 }), is_active: true },
    { id: 2, name: 'Deal Won -> Schedule Onboarding Task', event: 'deal:won', condition_json: JSON.stringify({ stage: 'Won' }), action_json: JSON.stringify({ type: 'create_task', title: 'Schedule kickoff & onboarding meeting', due_days: 1 }), is_active: true }
  ],
  automation_logs: [],
  documents: [
    { id: 1, name: 'SmartPay_Master_Services_Agreement_RZP.pdf', type: 'Contract', entity_type: 'company', entity_id: 1, file_path: '/documents/msa_rzp.pdf', file_size: 450000, version: 1, uploaded_by: 'Aarav Sharma', created_at: '2026-09-02' }
  ],
  approvals: [
    { id: 1, type: 'Discount Threshold', entity_type: 'quotation', entity_id: 2, requester_name: 'Priya Menon', approver_name: 'Aarav Sharma', status: 'Pending', old_value: '0%', new_value: '15%', comments: 'Discount requested for strategic Q3 sign-off', created_at: '2026-09-11' }
  ],
  notifications: [
    { id: 1, user_id: 1, type: 'quotation', title: 'Quotation Sent: QTN-2026-001', message: 'Quotation sent to neha.agarwal@razorpay.com', is_read: false, created_at: '2026-09-10T10:00:00.000Z' },
    { id: 2, user_id: 1, type: 'approval', title: 'Approval Required: Discount Threshold', message: 'Priya Menon requested 15% discount approval for Quotation QTN-2026-002', is_read: false, created_at: '2026-09-11T11:30:00.000Z' },
    { id: 3, user_id: 1, type: 'payment', title: 'Payment Received: INV-2026-001', message: 'Full payment of ₹5,07,400 received from RazorpayX Partners', is_read: true, created_at: '2026-09-04T14:15:00.000Z' },
    { id: 4, user_id: 1, type: 'renewal', title: 'Renewal Alert: RazorpayX Partners', message: 'Annual Payment Gateway contract renewal due on 2026-10-01', is_read: false, created_at: '2026-09-12T09:00:00.000Z' }
  ],
  quotation_versions: [],
  automation_settings: { discount_approval_percent: 15 }
};

const resolveResource = name => (name === 'customers' ? 'companies' : name);
const nextId = collection => Math.max(0, ...data[resolveResource(collection)].map(item => Number(item.id) || 0)) + 1;
const resource = name => {
  const target = resolveResource(name);
  if (!Object.hasOwn(data, target)) throw new Error(`Unknown CRM resource: ${name}`);
  return data[target];
};

const { getDb } = require('./db');

function updateCompanyDealCounts() {
  data.companies.forEach(company => {
    company.deals = data.deals.filter(deal => deal.company === company.name && !['Won', 'Lost'].includes(deal.stage)).length;
  });
}

// ─── Snapshot (full data dump) ──────────────────────────────────────

async function snapshot() {
  const sql = getDb();
  if (!sql) {
    updateCompanyDealCounts();
    return clone({
      companies: data.companies,
      deals: data.deals,
      tasks: data.tasks,
      contacts: data.contacts,
      activities: data.activities,
      letters: data.letters,
      stages: data.stages,
      products: data.products,
      quotations: data.quotations,
      quotation_items: data.quotation_items,
      quotation_versions: data.quotation_versions,
      purchase_orders: data.purchase_orders,
      invoices: data.invoices,
      invoice_items: data.invoice_items,
      payments: data.payments,
      teams: data.teams,
      commission_rules: data.commission_rules,
      commissions: data.commissions,
      sales_targets: data.sales_targets,
      leads: data.leads,
      renewals: data.renewals,
      communications: data.communications,
      email_templates: data.email_templates,
      automations: data.automations,
      documents: data.documents,
      approvals: data.approvals,
      notifications: data.notifications,
      automation_settings: data.automation_settings
    });
  }

  try {
    const [
      companies, deals, tasks, contacts, activities, letters, stages,
      products, quotations, quotation_items, purchase_orders, invoices, invoice_items, payments,
      teams, commission_rules, commissions, sales_targets,
      leads, renewals, communications, email_templates, automations, documents, approvals
    ] = await Promise.all([
      sql`SELECT * FROM companies ORDER BY id DESC`,
      sql`SELECT * FROM deals ORDER BY id DESC`,
      sql`SELECT * FROM tasks ORDER BY id DESC`,
      sql`SELECT * FROM contacts ORDER BY id DESC`,
      sql`SELECT * FROM activities ORDER BY id DESC`,
      sql`SELECT * FROM letters ORDER BY id DESC`,
      sql`SELECT * FROM stages`,
      sql`SELECT * FROM products ORDER BY id DESC`,
      sql`SELECT * FROM quotations ORDER BY id DESC`,
      sql`SELECT * FROM quotation_items ORDER BY sort_order ASC`,
      sql`SELECT * FROM purchase_orders ORDER BY id DESC`,
      sql`SELECT * FROM invoices ORDER BY id DESC`,
      sql`SELECT * FROM invoice_items ORDER BY sort_order ASC`,
      sql`SELECT * FROM payments ORDER BY id DESC`,
      sql`SELECT * FROM teams ORDER BY id DESC`,
      sql`SELECT * FROM commission_rules ORDER BY min_attainment_pct ASC`,
      sql`SELECT * FROM commissions ORDER BY id DESC`,
      sql`SELECT * FROM sales_targets ORDER BY id DESC`,
      sql`SELECT * FROM leads ORDER BY id DESC`.catch(() => data.leads),
      sql`SELECT * FROM renewals ORDER BY id DESC`.catch(() => data.renewals),
      sql`SELECT * FROM communications ORDER BY id DESC`.catch(() => data.communications),
      sql`SELECT * FROM email_templates ORDER BY id ASC`.catch(() => data.email_templates),
      sql`SELECT * FROM automations ORDER BY id DESC`.catch(() => data.automations),
      sql`SELECT * FROM documents ORDER BY id DESC`.catch(() => data.documents),
      sql`SELECT * FROM approvals ORDER BY id DESC`.catch(() => data.approvals)
    ]);

    return {
      companies, deals, tasks, contacts, activities, letters, stages,
      products, quotations, quotation_items, purchase_orders, invoices, invoice_items, payments,
      teams, commission_rules, commissions, sales_targets,
      leads, renewals, communications, email_templates, automations, documents, approvals
    };
  } catch (err) {
    return clone(data);
  }

  companies.forEach(company => {
    company.deals = deals.filter(deal => deal.company === company.name && !['Won', 'Lost'].includes(deal.stage)).length;
  });

  return {
    companies, deals, tasks, contacts, activities, letters, stages,
    products, quotations, quotation_items, purchase_orders, invoices, invoice_items, payments,
    teams, commission_rules, commissions, sales_targets
  };
}

// ─── Simple List (backward compat) ─────────────────────────────────

async function list(name) {
  const sql = getDb();
  if (!sql) return clone(resource(name));

  switch (name) {
    case 'companies': return await sql`SELECT * FROM companies ORDER BY id DESC`;
    case 'deals': return await sql`SELECT * FROM deals ORDER BY id DESC`;
    case 'tasks': return await sql`SELECT * FROM tasks ORDER BY id DESC`;
    case 'contacts': return await sql`SELECT * FROM contacts ORDER BY id DESC`;
    case 'activities': return await sql`SELECT * FROM activities ORDER BY id DESC`;
    case 'letters': return await sql`SELECT * FROM letters ORDER BY id DESC`;
    case 'stages': return await sql`SELECT * FROM stages`;
    case 'products': return await sql`SELECT * FROM products ORDER BY id DESC`;
    case 'quotations': return await sql`SELECT * FROM quotations ORDER BY id DESC`;
    case 'quotation_items': return await sql`SELECT * FROM quotation_items ORDER BY sort_order ASC`;
    case 'purchase_orders': return await sql`SELECT * FROM purchase_orders ORDER BY id DESC`;
    case 'invoices': return await sql`SELECT * FROM invoices ORDER BY id DESC`;
    case 'invoice_items': return await sql`SELECT * FROM invoice_items ORDER BY sort_order ASC`;
    case 'payments': return await sql`SELECT * FROM payments ORDER BY id DESC`;
    case 'teams': return await sql`SELECT * FROM teams ORDER BY id DESC`;
    case 'commission_rules': return await sql`SELECT * FROM commission_rules ORDER BY min_attainment_pct ASC`;
    case 'commissions': return await sql`SELECT * FROM commissions ORDER BY id DESC`;
    case 'sales_targets': return await sql`SELECT * FROM sales_targets ORDER BY id DESC`;
    default: throw new Error(`Unknown resource ${name}`);
  }
}

// ─── Paginated List with Filtering, Sorting, Search ─────────────────

async function listPaginated(name, { page = 1, limit = 25, sort = 'id', order = 'desc', search = '', searchFields = [], filters = {} } = {}) {
  const sql = getDb();
  const offset = (page - 1) * limit;

  if (!sql) {
    // In-memory implementation
    let records = clone(resource(name));

    // Apply filters
    for (const [key, value] of Object.entries(filters)) {
      if (key === '_value_min') {
        records = records.filter(r => (r.value || 0) >= value);
      } else if (key === '_value_max') {
        records = records.filter(r => (r.value || 0) <= value);
      } else if (key === 'user_id') {
        records = records.filter(r => r.user_id === value);
      } else {
        records = records.filter(r => String(r[key] || '').toLowerCase() === String(value).toLowerCase());
      }
    }

    // Apply search
    if (search && searchFields.length > 0) {
      const q = search.toLowerCase();
      records = records.filter(r =>
        searchFields.some(field => String(r[field] || '').toLowerCase().includes(q))
      );
    }

    // Sort
    records.sort((a, b) => {
      const aVal = a[sort] ?? '';
      const bVal = b[sort] ?? '';
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return order === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return order === 'asc' ? cmp : -cmp;
    });

    const total = records.length;
    const paged = records.slice(offset, offset + limit);
    return { data: paged, total };
  }

  // Database implementation
  try {
    let conditions = [];
    let params = [];
    let idx = 1;

    // Build filters
    for (const [key, value] of Object.entries(filters)) {
      if (key === '_value_min') {
        conditions.push(`value >= $${idx++}`);
        params.push(value);
      } else if (key === '_value_max') {
        conditions.push(`value <= $${idx++}`);
        params.push(value);
      } else if (key === 'user_id') {
        conditions.push(`user_id = $${idx++}`);
        params.push(value);
      } else {
        conditions.push(`LOWER("${key}") = LOWER($${idx++})`);
        params.push(String(value));
      }
    }

    // Build search
    if (search && searchFields.length > 0) {
      const searchConditions = searchFields.map(field => {
        params.push(`%${search}%`);
        return `"${field}" ILIKE $${idx++}`;
      });
      conditions.push(`(${searchConditions.join(' OR ')})`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Whitelist sort column
    const safeSort = /^[a-zA-Z_]+$/.test(sort) ? `"${sort}"` : '"id"';
    const safeOrder = order === 'asc' ? 'ASC' : 'DESC';

    const query = `SELECT * FROM ${name} ${where} ORDER BY ${safeSort} ${safeOrder} LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const rows = await sql(query, params);

    const countQuery = `SELECT COUNT(*) as count FROM ${name} ${where}`;
    const countParams = params.slice(0, -2);
    const countResult = await sql(countQuery, countParams);

    return { data: rows, total: Number(countResult[0].count) };
  } catch (err) {
    console.error('DB listPaginated error:', err.message);
    // Fallback to in-memory
    const records = clone(resource(name));
    return { data: records.slice(offset, offset + limit), total: records.length };
  }
}

// ─── Find by ID ─────────────────────────────────────────────────────

async function findById(name, id) {
  const sql = getDb();
  if (!sql) {
    const record = resource(name).find(item => String(item.id) === String(id) || Number(item.id) === Number(id));
    return record ? clone(record) : null;
  }

  try {
    const rows = await sql(`SELECT * FROM ${name} WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] || null;
  } catch (err) {
    console.error('DB findById error:', err.message);
    const record = resource(name).find(item => String(item.id) === String(id) || Number(item.id) === Number(id));
    return record ? clone(record) : null;
  }
}

// ─── Create ─────────────────────────────────────────────────────────

async function create(name, attributes) {
  const sql = getDb();
  if (!sql) {
    const record = { id: nextId(name), ...attributes };
    resource(name).unshift(record);
    updateCompanyDealCounts();
    return clone(record);
  }

  const keys = Object.keys(attributes);
  const values = Object.values(attributes);
  if (keys.length === 0) throw new Error('No attributes to insert');

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const cols = keys.map(k => `"${k}"`).join(', ');
  const query = `INSERT INTO ${name} (${cols}) VALUES (${placeholders}) RETURNING *`;

  const rows = await sql(query, values);
  return rows[0];
}

// ─── Update ─────────────────────────────────────────────────────────

async function update(name, id, attributes) {
  const sql = getDb();
  if (!sql) {
    const record = resource(name).find(item => String(item.id) === String(id) || Number(item.id) === Number(id));
    if (!record) return null;
    Object.assign(record, attributes);
    updateCompanyDealCounts();
    return clone(record);
  }

  const keys = Object.keys(attributes);
  const values = Object.values(attributes);
  if (keys.length === 0) return null;

  const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
  const query = `UPDATE ${name} SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`;

  const rows = await sql(query, [...values, id]);
  return rows.length ? rows[0] : null;
}

// ─── Delete ─────────────────────────────────────────────────────────

async function remove(name, id) {
  const sql = getDb();
  if (!sql) {
    const records = resource(name);
    const index = records.findIndex(item => String(item.id) === String(id) || Number(item.id) === Number(id));
    if (index < 0) return false;
    records.splice(index, 1);
    updateCompanyDealCounts();
    return true;
  }

  const rows = await sql(`DELETE FROM ${name} WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}

module.exports = { snapshot, list, listPaginated, findById, create, update, remove };
