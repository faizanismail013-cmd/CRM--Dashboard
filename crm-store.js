/**
 * In-process CRM repository used when a hosted database is not configured.
 * The public API is intentionally asynchronous so it can be replaced by a
 * database repository without changing routes or clients.
 */

const clone = value => JSON.parse(JSON.stringify(value));

const data = {
  companies: [
    { id: 1, name: 'RazorpayX Partners', initial: 'R', logo: 'purple-logo', industry: 'Fintech', owner: 'Aarav Sharma', status: 'active', deals: 2, activity: 'Today, 10:40 AM', created: 8, tags: ['high value'] },
    { id: 2, name: 'Urban Company', initial: 'U', logo: 'logo-cyan', industry: 'SaaS', owner: 'Aarav Sharma', status: 'active', deals: 1, activity: 'Today, 9:15 AM', created: 5, tags: ['at risk'] },
    { id: 3, name: 'Groww Wealth', initial: 'G', logo: 'logo-blue', industry: 'Fintech', owner: 'Priya Menon', status: 'lead', deals: 1, activity: 'Yesterday', created: 12, tags: ['high value'] },
    { id: 4, name: 'Practo Health', initial: 'P', logo: 'logo-orange', industry: 'Healthcare', owner: 'Kunal Shah', status: 'lead', deals: 1, activity: '28 Aug', created: 2, tags: ['referral'] },
    { id: 5, name: 'Meesho Retail', initial: 'M', logo: 'logo-green', industry: 'Retail', owner: 'Aarav Sharma', status: 'active', deals: 2, activity: '26 Aug', created: 3, tags: ['high value'] },
    { id: 6, name: 'Niyo Solutions', initial: 'N', logo: 'purple-logo', industry: 'Fintech', owner: 'Priya Menon', status: 'lead', deals: 1, activity: '24 Aug', created: 9, tags: [] },
    { id: 7, name: 'Licious Foods', initial: 'L', logo: 'logo-orange', industry: 'Retail', owner: 'Kunal Shah', status: 'active', deals: 0, activity: '21 Aug', created: 4, tags: ['referral'] },
    { id: 8, name: 'CleverTap', initial: 'C', logo: 'logo-blue', industry: 'SaaS', owner: 'Aarav Sharma', status: 'churned', deals: 0, activity: '12 Aug', created: 7, tags: ['at risk'] }
  ],
  deals: [
    { id: 1, title: 'Marketplace payouts', company: 'Urban Company', value: 680000, stage: 'New Lead', probability: 10, owner: 'Aarav Sharma', due: 'Sep 24', month: 'September', tag: 'at risk' },
    { id: 2, title: 'Payment gateway expansion', company: 'RazorpayX Partners', value: 800000, stage: 'Proposal Sent', probability: 50, owner: 'Aarav Sharma', due: 'Sep 18', month: 'September', tag: 'high value' },
    { id: 3, title: 'UPI Autopay upgrade', company: 'RazorpayX Partners', value: 450000, stage: 'Negotiation', probability: 75, owner: 'Aarav Sharma', due: 'Sep 28', month: 'September', tag: 'high value' },
    { id: 4, title: 'Merchant onboarding', company: 'Groww Wealth', value: 520000, stage: 'Qualified', probability: 25, owner: 'Priya Menon', due: 'Sep 22', month: 'September', tag: 'high value' },
    { id: 5, title: 'Subscription payments', company: 'Meesho Retail', value: 370000, stage: 'Proposal Sent', probability: 50, owner: 'Aarav Sharma', due: 'Oct 05', month: 'October', tag: 'high value' },
    { id: 6, title: 'Healthcare collections', company: 'Practo Health', value: 250000, stage: 'Qualified', probability: 25, owner: 'Kunal Shah', due: 'Oct 12', month: 'October', tag: 'referral' },
    { id: 7, title: 'Multi-store settlement', company: 'Niyo Solutions', value: 290000, stage: 'New Lead', probability: 10, owner: 'Priya Menon', due: 'Oct 16', month: 'October', tag: '' },
    { id: 8, title: 'Express checkout', company: 'Meesho Retail', value: 810000, stage: 'Negotiation', probability: 75, owner: 'Aarav Sharma', due: 'Sep 30', month: 'September', tag: 'high value' },
    { id: 9, title: 'Enterprise payouts', company: 'Licious Foods', value: 330000, stage: 'Qualified', probability: 25, owner: 'Kunal Shah', due: 'Oct 20', month: 'October', tag: 'referral' }
  ],
  tasks: [
    { id: 1, title: 'Send revised proposal', company: 'Urban Company', due: 'Overdue · Aug 30', bucket: 'overdue', priority: 'high', done: false, assignee: 'Aarav Sharma' },
    { id: 2, title: 'Call Neha about final approval', company: 'RazorpayX Partners', due: 'Today · 2:00 PM', bucket: 'today', priority: 'high', done: false, assignee: 'Aarav Sharma' },
    { id: 3, title: 'Update discovery notes', company: 'Groww Wealth', due: 'Today · 4:30 PM', bucket: 'today', priority: 'medium', done: false, assignee: 'Aarav Sharma' },
    { id: 4, title: 'Share onboarding checklist', company: 'Meesho Retail', due: 'Today · 5:00 PM', bucket: 'today', priority: 'medium', done: false, assignee: 'Aarav Sharma' },
    { id: 5, title: 'Prepare negotiation brief', company: 'RazorpayX Partners', due: 'Tomorrow', bucket: 'week', priority: 'high', done: false, assignee: 'Aarav Sharma' },
    { id: 6, title: 'Schedule demo with finance', company: 'Practo Health', due: 'Wed, Sep 3', bucket: 'week', priority: 'medium', done: false, assignee: 'Kunal Shah' },
    { id: 7, title: 'Review contract amendment', company: 'Groww Wealth', due: 'Thu, Sep 4', bucket: 'week', priority: 'low', done: false, assignee: 'Priya Menon' },
    { id: 8, title: 'Confirm tax setup', company: 'RazorpayX Partners', due: 'Fri, Aug 29', bucket: 'done', priority: 'medium', done: true, assignee: 'Aarav Sharma' }
  ],
  contacts: [
    { id: 1, name: 'Neha Agarwal', initials: 'NA', title: 'VP, Partnerships', email: 'neha.agarwal@razorpay.com', phone: '+91 98765 34021', primary: true },
    { id: 2, name: 'Rohan Kulkarni', initials: 'RK', title: 'Director, Finance', email: 'rohan.k@razorpay.com', phone: '+91 98210 14920', primary: false },
    { id: 3, name: 'Maya Singh', initials: 'MS', title: 'Procurement Manager', email: 'maya.singh@razorpay.com', phone: '+91 99234 89070', primary: false }
  ],
  activities: [
    { id: 1, type: 'call', icon: '☎', text: '<strong>Call with Neha Agarwal</strong> at RazorpayX Partners · Discussed procurement sign-off for the gateway expansion.', time: '20 min ago' },
    { id: 2, type: 'email', icon: '✉', text: '<strong>Sent proposal</strong> to Rahul Mehta at Urban Company · Marketplace payout pricing and rollout plan.', time: '1 hr ago' },
    { id: 3, type: 'meeting', icon: '▣', text: '<strong>Demo meeting completed</strong> with Groww Wealth · Added discovery notes and next steps.', time: 'Yesterday' },
    { id: 4, type: 'note', icon: '▤', text: '<strong>Added account note</strong> for Meesho Retail · Legal review is expected by Thursday.', time: 'Yesterday' }
  ],
  letters: [],
  stages: [
    { name: 'New Lead', probability: 10, color: '#8fa1bb' }, { name: 'Qualified', probability: 25, color: '#38a9b8' },
    { name: 'Proposal Sent', probability: 50, color: '#4c84d9' }, { name: 'Negotiation', probability: 75, color: '#315fba' },
    { name: 'Won', probability: 100, color: '#29a56b' }
  ]
};

const nextId = collection => Math.max(0, ...data[collection].map(item => Number(item.id) || 0)) + 1;
const resource = name => {
  if (!Object.hasOwn(data, name)) throw new Error(`Unknown CRM resource: ${name}`);
  return data[name];
};

const { getDb } = require('./db');

function updateCompanyDealCounts() {
  data.companies.forEach(company => {
    company.deals = data.deals.filter(deal => deal.company === company.name && !['Won', 'Lost'].includes(deal.stage)).length;
  });
}

async function snapshot() {
  const sql = getDb();
  if (!sql) {
    updateCompanyDealCounts();
    return clone({ companies: data.companies, deals: data.deals, tasks: data.tasks, contacts: data.contacts, activities: data.activities, letters: data.letters, stages: data.stages });
  }

  const [companies, deals, tasks, contacts, activities, letters, stages] = await Promise.all([
    sql`SELECT * FROM companies ORDER BY id DESC`,
    sql`SELECT * FROM deals ORDER BY id DESC`,
    sql`SELECT * FROM tasks ORDER BY id DESC`,
    sql`SELECT * FROM contacts ORDER BY id DESC`,
    sql`SELECT * FROM activities ORDER BY id DESC`,
    sql`SELECT * FROM letters ORDER BY id DESC`,
    sql`SELECT * FROM stages`
  ]);

  companies.forEach(company => {
    company.deals = deals.filter(deal => deal.company === company.name && !['Won', 'Lost'].includes(deal.stage)).length;
  });

  return { companies, deals, tasks, contacts, activities, letters, stages };
}

async function list(name) { 
  const sql = getDb();
  if (!sql) return clone(resource(name));
  
  switch(name) {
    case 'companies': return await sql`SELECT * FROM companies ORDER BY id DESC`;
    case 'deals': return await sql`SELECT * FROM deals ORDER BY id DESC`;
    case 'tasks': return await sql`SELECT * FROM tasks ORDER BY id DESC`;
    case 'contacts': return await sql`SELECT * FROM contacts ORDER BY id DESC`;
    case 'activities': return await sql`SELECT * FROM activities ORDER BY id DESC`;
    case 'letters': return await sql`SELECT * FROM letters ORDER BY id DESC`;
    case 'stages': return await sql`SELECT * FROM stages`;
    default: throw new Error(`Unknown resource ${name}`);
  }
}

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
  
  // Neon sql tag template is based on postgres, but safely we can just do manual mapping for small tables.
  // Actually, we can use simple parameterized queries for postgres by building string since it's a serverless neon function
  // Wait, neon allows passing an array of values if we use the traditional query method, or we can just use the sql helper
  // But since we want to be safe without knowing the exact neon wrapper API for dynamic inserts, we'll build it:
  
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const cols = keys.map(k => `"${k}"`).join(', ');
  
  const query = `INSERT INTO ${name} (${cols}) VALUES (${placeholders}) RETURNING *`;
  
  // Using the raw query method if sql is a neon instance
  const rows = await sql(query, values);
  return rows[0];
}

async function update(name, id, attributes) {
  const sql = getDb();
  if (!sql) {
    const record = resource(name).find(item => Number(item.id) === Number(id));
    if (!record) return null;
    Object.assign(record, attributes);
    updateCompanyDealCounts();
    return clone(record);
  }

  const keys = Object.keys(attributes);
  const values = Object.values(attributes);
  if (keys.length === 0) return null;

  const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
  const query = `UPDATE ${name} SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`;
  
  const rows = await sql(query, [...values, id]);
  return rows.length ? rows[0] : null;
}

async function remove(name, id) {
  const sql = getDb();
  if (!sql) {
    const records = resource(name);
    const index = records.findIndex(item => Number(item.id) === Number(id));
    if (index < 0) return false;
    records.splice(index, 1);
    updateCompanyDealCounts();
    return true;
  }

  const rows = await sql(`DELETE FROM ${name} WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}

module.exports = { snapshot, list, create, update, remove };
