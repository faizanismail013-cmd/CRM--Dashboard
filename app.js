const state = {
  activeView: 'dashboard',
  companyTab: 'overview',
  taskFilter: 'open',
  pendingMove: null,
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
  activities: [
    { type: 'call', icon: '☎', text: '<strong>Call with Neha Agarwal</strong> at RazorpayX Partners · Discussed procurement sign-off for the gateway expansion.', time: '20 min ago' },
    { type: 'email', icon: '✉', text: '<strong>Sent proposal</strong> to Rahul Mehta at Urban Company · Marketplace payout pricing and rollout plan.', time: '1 hr ago' },
    { type: 'meeting', icon: '▣', text: '<strong>Demo meeting completed</strong> with Groww Wealth · Added discovery notes and next steps.', time: 'Yesterday' },
    { type: 'note', icon: '▤', text: '<strong>Added account note</strong> for Meesho Retail · Legal review is expected by Thursday.', time: 'Yesterday' }
  ],
  stages: [
    { name: 'New Lead', probability: 10, color: '#8fa1bb' },
    { name: 'Qualified', probability: 25, color: '#38a9b8' },
    { name: 'Proposal Sent', probability: 50, color: '#4c84d9' },
    { name: 'Negotiation', probability: 75, color: '#315fba' },
    { name: 'Won', probability: 100, color: '#29a56b' }
  ],
  contacts: [
    { name: 'Neha Agarwal', initials: 'NA', title: 'VP, Partnerships', email: 'neha.agarwal@razorpay.com', phone: '+91 98765 34021', primary: true },
    { name: 'Rohan Kulkarni', initials: 'RK', title: 'Director, Finance', email: 'rohan.k@razorpay.com', phone: '+91 98210 14920', primary: false },
    { name: 'Maya Singh', initials: 'MS', title: 'Procurement Manager', email: 'maya.singh@razorpay.com', phone: '+91 99234 89070', primary: false }
  ]
};

const money = value => `₹${(value / 100000).toFixed(value % 100000 ? 1 : 0)}L`;
const initials = name => name.split(' ').map(n => n[0]).join('').slice(0, 2);
const el = id => document.getElementById(id);

function openView(view) {
  state.activeView = view;
  document.querySelectorAll('.view').forEach(node => node.classList.toggle('active', node.id === `${view}-view`));
  document.querySelectorAll('.nav-link[data-view]').forEach(node => node.classList.toggle('active', node.dataset.view === view));
  el('sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function pipelineStats() {
  const active = state.deals.filter(d => !['Won', 'Lost'].includes(d.stage));
  return { value: active.reduce((sum, d) => sum + d.value, 0), forecast: active.reduce((sum, d) => sum + d.value * d.probability / 100, 0) };
}

function renderTotals() {
  const totals = pipelineStats();
  ['pipelineTotal', 'pipelineHeadline'].forEach(id => { if (el(id)) el(id).textContent = money(totals.value); });
  ['forecastTotal', 'forecastHeadline'].forEach(id => { if (el(id)) el(id).textContent = money(totals.forecast); });
  const open = state.tasks.filter(t => !t.done && t.assignee === 'Aarav Sharma').length;
  el('tasksTotal').textContent = String(open).padStart(2, '0');
  el('openTaskCount').textContent = String(open).padStart(2, '0');
  document.querySelectorAll('.alert-count').forEach(n => n.textContent = state.tasks.filter(t => !t.done && t.bucket === 'overdue').length);
}

function renderStageChart() {
  const stages = state.stages.slice(0, 4);
  const values = stages.map(s => state.deals.filter(d => d.stage === s.name).reduce((sum, d) => sum + d.value, 0));
  const max = Math.max(...values, 1);
  el('stageChart').innerHTML = stages.map((s, i) => {
    const value = values[i], forecast = value * s.probability / 100;
    return `<div class="stage-col"><span class="stage-amount">${money(value)}</span><div class="stage-bars"><i style="height:${Math.max(9, value / max * 100)}%"></i><i class="forecast" style="height:${Math.max(7, forecast / max * 100)}%"></i></div><small>${s.name.replace(' ', '<br>')}</small></div>`;
  }).join('');
}

function taskRow(task, full = false) {
  const dueClass = task.bucket === 'overdue' ? 'due-overdue' : task.bucket === 'today' ? 'due-today' : 'due-soon';
  return `<div class="task-row ${task.done ? 'done' : ''}" data-task-id="${task.id}"><input class="task-check" type="checkbox" ${task.done ? 'checked' : ''} aria-label="Mark ${task.title} done" /><div class="task-copy">${full ? `<span class="priority ${task.priority}">${task.priority}</span>` : ''}<div><strong>${task.title}</strong><small>${task.company}</small></div></div>${full ? `<span class="task-company">${task.assignee}</span>` : ''}<span class="task-due ${dueClass}">${task.done ? 'Done' : task.due}</span></div>`;
}

function renderTasks() {
  const personal = state.tasks.filter(t => t.assignee === 'Aarav Sharma' && !t.done).slice(0, 4);
  el('dashboardTasks').innerHTML = personal.map(t => taskRow(t)).join('');
  const searchable = (el('taskSearch')?.value || '').toLowerCase();
  const priority = el('priorityFilter')?.value || 'all';
  const filtered = state.tasks.filter(t => {
    const mode = state.taskFilter;
    const matchesMode = mode === 'open' ? !t.done : mode === 'done' ? t.done : t.bucket === mode && !t.done;
    return matchesMode && (priority === 'all' || t.priority === priority) && `${t.title} ${t.company}`.toLowerCase().includes(searchable);
  });
  const groups = state.taskFilter === 'open' ? [['Overdue', 'overdue'], ['Today', 'today'], ['This week', 'week']] : state.taskFilter === 'done' ? [['Completed', 'done']] : [[state.taskFilter === 'overdue' ? 'Overdue' : 'Due today', state.taskFilter]];
  el('taskGroups').innerHTML = groups.map(([label, bucket]) => {
    const list = filtered.filter(t => t.bucket === bucket);
    return list.length ? `<section class="task-group"><h3>${label} <span>(${list.length})</span>${bucket === 'overdue' ? ' <small class="overdue-label">Needs attention</small>' : ''}</h3>${list.map(t => taskRow(t, true)).join('')}</section>` : '';
  }).join('') || '<p class="empty-state">No tasks match this view.</p>';
  el('companyTaskList').innerHTML = state.tasks.filter(t => t.company === 'RazorpayX Partners' && !t.done).map(t => taskRow(t, true)).join('');
}

function renderActivity() {
  const markup = state.activities.map(a => `<div class="activity-item"><span class="activity-icon ${a.type}">${a.icon}</span><div class="activity-copy">${a.text}</div><time>${a.time}</time></div>`).join('');
  el('activityFeed').innerHTML = markup;
  document.querySelectorAll('.company-feed').forEach(node => node.innerHTML = markup);
  el('fullCompanyActivity').innerHTML = markup + `<div class="activity-item"><span class="activity-icon call">☎</span><div class="activity-copy"><strong>Call with Rohan Kulkarni</strong> · Confirmed finance team has reviewed the implementation schedule.</div><time>28 Aug</time></div><div class="activity-item"><span class="activity-icon note">▤</span><div class="activity-copy"><strong>Added account note</strong> · Renewal opportunity expected in Q4; link it to a new deal when confirmed.</div><time>26 Aug</time></div>`;
}

function renderTeam() {
  const team = [{ name: 'Aarav Sharma', avatar: 'AS', cls: 'avatar-blue', open: 5, forecast: '₹12.3L', tasks: 4 }, { name: 'Priya Menon', avatar: 'PM', cls: 'avatar-cyan', open: 4, forecast: '₹6.1L', tasks: 3 }, { name: 'Kunal Shah', avatar: 'KS', cls: 'avatar-orange', open: 3, forecast: '₹3.8L', tasks: 2 }];
  el('teamTable').innerHTML = `<div class="team-row"><span>Owner</span><span>Open deals</span><span>Forecast</span><span>Tasks</span></div>${team.map(r => `<div class="team-row"><div class="team-member"><span class="avatar ${r.cls}">${r.avatar}</span>${r.name}</div><b>${r.open}</b><b>${r.forecast}</b><b>${r.tasks}</b></div>`).join('')}`;
}

function renderCompanies() {
  const search = (el('companySearch')?.value || '').toLowerCase();
  const status = el('statusFilter')?.value || 'all', industry = el('industryFilter')?.value || 'all', tag = el('tagFilter')?.value || 'all', sort = el('companySort')?.value || 'activity';
  let companies = state.companies.filter(c => (status === 'all' || c.status === status) && (industry === 'all' || c.industry === industry) && (tag === 'all' || c.tags.includes(tag)) && c.name.toLowerCase().includes(search));
  companies.sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'created' ? b.created - a.created : a.created - b.created);
  el('companyResultCount').textContent = `${companies.length} ${companies.length === 1 ? 'company' : 'companies'}`;
  el('companyTableBody').innerHTML = companies.map(c => `<tr><td><button class="company-cell company-open" data-company-id="${c.id}"><span class="company-logo ${c.logo}">${c.initial}</span><span>${c.name}<small>${c.tags.map(t => t === 'high value' ? 'High value' : t).join(' · ') || 'No tags'}</small></span></button></td><td>${c.industry}</td><td>${c.owner}</td><td><span class="status ${c.status}">${c.status[0].toUpperCase()+c.status.slice(1)}</span></td><td>${c.deals}</td><td>${c.activity}</td><td><button class="row-action" aria-label="More actions for ${c.name}">⋮</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty-cell">No companies match these filters.</td></tr>';
}

function dealAvatar(owner) { const map = {'Aarav Sharma':['AS','avatar-blue'],'Priya Menon':['PM','avatar-cyan'],'Kunal Shah':['KS','avatar-orange']}; return map[owner] || [initials(owner),'avatar-blue']; }
function renderKanban() {
  const owner = el('ownerFilter')?.value || 'all', tag = el('pipelineTagFilter')?.value || 'all', month = el('closeFilter')?.value || 'all';
  const stages = [...state.stages, { name: 'Lost', probability: 0, color: '#d98697' }];
  el('kanbanBoard').innerHTML = stages.map(stage => {
    const all = state.deals.filter(d => d.stage === stage.name);
    const deals = all.filter(d => (owner === 'all'||d.owner===owner) && (tag === 'all'||d.tag===tag) && (month === 'all'||d.month===month));
    const stageValue = all.reduce((sum, d) => sum + d.value, 0);
    return `<section class="kanban-column" data-stage="${stage.name}" style="--stage-color:${stage.color}"><header class="kanban-column-header"><div><i></i><b>${stage.name}</b><span>${deals.length}</span></div><small>${money(stageValue)}</small></header><div class="kanban-deals">${deals.map(d => { const [initial, cls] = dealAvatar(d.owner); return `<article class="deal-card" draggable="true" data-deal-id="${d.id}"><p class="deal-title">${d.title}</p><p class="deal-company">${d.company}</p><div class="deal-value"><span>${money(d.value)}</span><span class="probability">${d.probability}%</span></div><footer class="deal-card-footer"><span class="avatar ${cls}">${initial}</span><time>${d.due}</time>${d.tag ? `<span class="deal-tag">${d.tag === 'high value' ? 'High value' : 'At risk'}</span>` : ''}</footer></article>`; }).join('') || '<div class="empty-column">Drop deal here</div>'}</div></section>`;
  }).join('');
  bindDnD();
}

function bindDnD() {
  document.querySelectorAll('.deal-card').forEach(card => card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', card.dataset.dealId); card.classList.add('dragging'); }));
  document.querySelectorAll('.deal-card').forEach(card => card.addEventListener('dragend', () => card.classList.remove('dragging')));
  document.querySelectorAll('.kanban-column').forEach(column => {
    column.addEventListener('dragover', e => { e.preventDefault(); column.classList.add('drag-over'); });
    column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
    column.addEventListener('drop', e => { e.preventDefault(); column.classList.remove('drag-over'); const deal = state.deals.find(d => d.id === Number(e.dataTransfer.getData('text/plain'))); if (deal && deal.stage !== column.dataset.stage) moveDeal(deal, column.dataset.stage); });
  });
}

function moveDeal(deal, target) {
  if (target === 'Won' || target === 'Lost') {
    state.pendingMove = { deal, target };
    el('stageModalTitle').textContent = `Mark “${deal.title}” as ${target.toLowerCase()}?`;
    el('stageModalCopy').textContent = target === 'Lost' ? 'Add a loss reason to close this deal. The outcome is saved in the audit trail.' : 'This will close the deal, record the outcome and timestamp the stage change.';
    el('lostReasonLabel').classList.toggle('hidden', target !== 'Lost');
    showModal('stageModal');
  } else {
    deal.stage = target; deal.probability = state.stages.find(s => s.name === target)?.probability ?? deal.probability;
    renderAll(); showToast(`${deal.title} moved to ${target}. Probability updated to ${deal.probability}%.`);
  }
}

function renderContacts() {
  el('contactTable').innerHTML = state.contacts.map(c => `<tr><td><div class="company-cell"><span class="avatar avatar-blue">${c.initials}</span><span>${c.name}</span></div></td><td>${c.title}</td><td>${c.email}</td><td>${c.phone}</td><td>${c.primary ? '<span class="status active">Primary</span>' : '<span class="muted-copy">Contact</span>'}</td><td><button class="row-action" aria-label="Edit ${c.name}">⋮</button></td></tr>`).join('');
}

function renderCompanyDeals() {
  el('companyDeals').innerHTML = state.deals.filter(d => d.company === 'RazorpayX Partners').map(d => `<article class="panel deal-card-detail"><div class="deal-meta"><span><span class="status lead">${d.stage}</span></span><span>Closes ${d.due}</span></div><h3>${d.title}</h3><div class="deal-detail-values"><p>Deal value<b>${money(d.value)}</b></p><p>Probability<b>${d.probability}%</b></p><p>Forecast<b>${money(d.value * d.probability / 100)}</b></p></div></article>`).join('');
}

function renderReports() {
  const months = [['Apr',8.8,3.4],['May',10.2,2.7],['Jun',7.4,4.5],['Jul',13.6,3.1],['Aug',9.7,4.1],['Sep',11.4,4.2]], max = 14;
  el('reportBars').innerHTML = months.map(([label,won,lost]) => `<div class="bar-month"><div class="bar-pair"><i class="won" style="height:${won/max*100}%" data-value="Won: ₹${won}L"></i><i class="lost" style="height:${lost/max*100}%" data-value="Lost: ₹${lost}L"></i></div><small>${label}</small></div>`).join('');
  const reps = [{n:'Aarav Sharma',v:'₹7.2L',w:'3 won',a:'AS',c:'avatar-blue'},{n:'Priya Menon',v:'₹4.8L',w:'2 won',a:'PM',c:'avatar-cyan'},{n:'Kunal Shah',v:'₹2.2L',w:'1 won',a:'KS',c:'avatar-orange'}];
  el('repTable').innerHTML = `<div class="rep-row"><span>Rep</span><span>Won value</span><span>Deals won</span></div>${reps.map(r=>`<div class="rep-row"><div class="team-member"><span class="avatar ${r.c}">${r.a}</span>${r.n}</div><b>${r.v}</b><b>${r.w}</b></div>`).join('')}`;
  const funnel = [{l:'New Lead',n:6,s:5,c:'#e6effd'},{l:'Qualified',n:5,s:4,c:'#ddecf9'},{l:'Proposal',n:4,s:3,c:'#d0e6f8'},{l:'Negotiation',n:3,s:2,c:'#c5e8e9'},{l:'Won',n:2,s:1,c:'#d7f0e2'}];
  el('conversionFunnel').innerHTML = funnel.map(f => `<div class="funnel-step" style="--funnel-size:${f.s};--funnel-color:${f.c}"><strong>${f.l}</strong><span>${f.n} deals</span></div>`).join('');
}

function renderSettings() {
  const users = [{n:'Aarav Sharma',e:'aarav@smartpay.in',r:'Sales Manager',s:'All companies & reports',a:'AS',c:'avatar-blue',last:'Now'},{n:'Priya Menon',e:'priya@smartpay.in',r:'Sales Rep',s:'Assigned book of business',a:'PM',c:'avatar-cyan',last:'12 min ago'},{n:'Kunal Shah',e:'kunal@smartpay.in',r:'Sales Rep',s:'Assigned book of business',a:'KS',c:'avatar-orange',last:'1 hr ago'},{n:'Ritika Shah',e:'ritika@smartpay.in',r:'Viewer',s:'All CRM data · read-only',a:'RS',c:'avatar-blue',last:'Yesterday'}];
  el('usersTable').innerHTML = users.map(u=>`<tr><td><div class="company-cell"><span class="avatar ${u.c}">${u.a}</span><span>${u.n}<small>${u.e}</small></span></div></td><td><span class="tag ${u.r==='Viewer'?'orange-tag':'blue-tag'}">${u.r}</span></td><td>${u.s}</td><td>${u.last}</td><td><button class="row-action" aria-label="Manage ${u.n}">⋮</button></td></tr>`).join('');
  el('stageSettingsList').innerHTML = state.stages.concat([{name:'Lost',probability:0,color:'#d98697'}]).map((s,i)=>`<div class="stage-setting"><span>⠿</span><p><strong>${s.name}</strong><small>${i < 5 ? 'Default sales stage' : 'Closed outcome'}</small></p><label>Probability <input type="number" value="${s.probability}" min="0" max="100" data-stage-prob="${s.name}" />%</label><button class="button button-quiet stage-edit">${s.name==='Lost'?'Protected':'Edit'}</button></div>`).join('');
  const tags = [['High value','#4e7ecb'],['At risk','#d36175'],['Referral partner','#e39138'],['Strategic','#7967d6'],['Enterprise','#259f91']];
  el('tagSettingsList').innerHTML = tags.map(t=>`<div class="tag-setting" style="--tag-color:${t[1]}"><i></i>${t[0]}<button aria-label="Remove ${t[0]}">×</button></div>`).join('');
}

function renderAll() { renderTotals(); renderStageChart(); renderTasks(); renderActivity(); renderTeam(); renderCompanies(); renderKanban(); renderContacts(); renderCompanyDeals(); renderReports(); renderSettings(); }

function showModal(id) { el('modalLayer').classList.add('open'); el('modalLayer').setAttribute('aria-hidden','false'); document.querySelectorAll('.modal').forEach(m=>m.classList.toggle('active',m.id===id)); const first=el(id).querySelector('input,select,textarea,button'); if(first) setTimeout(()=>first.focus(),30); }
function closeModal() { el('modalLayer').classList.remove('open'); el('modalLayer').setAttribute('aria-hidden','true'); document.querySelectorAll('.modal').forEach(m=>m.classList.remove('active')); }
let toastTimer; function showToast(message) { const node=el('toast'); node.textContent=message; node.classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>node.classList.remove('visible'),3600); }

function setCompanyTab(tab) { state.companyTab=tab; document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.companyTab===tab)); document.querySelectorAll('.company-tab').forEach(p=>p.classList.toggle('active',p.id===`${tab}-tab`)); }

document.addEventListener('click', event => {
  const viewButton = event.target.closest('[data-view],[data-view-go]'); if(viewButton){ openView(viewButton.dataset.view || viewButton.dataset.viewGo); return; }
  const modalButton = event.target.closest('[data-open-modal]'); if(modalButton){ showModal(modalButton.dataset.openModal); return; }
  if(event.target.closest('[data-close-modal]') || event.target === el('modalLayer')) { closeModal(); return; }
  const tab = event.target.closest('[data-company-tab],[data-company-tab-go]'); if(tab){ setCompanyTab(tab.dataset.companyTab || tab.dataset.companyTabGo); return; }
  const settings = event.target.closest('[data-settings]'); if(settings){ document.querySelectorAll('.settings-link').forEach(n=>n.classList.toggle('active',n===settings)); document.querySelectorAll('.settings-panel').forEach(n=>n.classList.toggle('active',n.id===`${settings.dataset.settings}-settings`)); return; }
  const company = event.target.closest('.company-open'); if(company){ openView('company-detail'); setCompanyTab('overview'); return; }
  const taskFilter = event.target.closest('[data-task-filter]'); if(taskFilter){ state.taskFilter=taskFilter.dataset.taskFilter; document.querySelectorAll('[data-task-filter]').forEach(n=>n.classList.toggle('active',n===taskFilter)); renderTasks(); return; }
  if(event.target.closest('#notificationBtn')) { el('notificationPopover').classList.toggle('visible'); return; }
  if(!event.target.closest('.notification-popover')) el('notificationPopover').classList.remove('visible');
  if(event.target.closest('#showReminders')) { state.taskFilter='overdue'; document.querySelectorAll('[data-task-filter]').forEach(n=>n.classList.toggle('active',n.dataset.taskFilter==='overdue')); renderTasks(); return; }
  if(event.target.closest('#mobileMenu')) { el('sidebar').classList.toggle('open'); return; }
  if(event.target.closest('#addStage')) { const name=prompt('New stage name'); if(name){state.stages.splice(-1,0,{name,probability:50,color:'#50a8c6'});renderAll();showToast(`${name} stage added.`)} return; }
  if(event.target.closest('#addTag')) { const name=prompt('New tag name'); if(name){el('tagSettingsList').insertAdjacentHTML('beforeend',`<div class="tag-setting" style="--tag-color:#50a8c6"><i></i>${name}<button aria-label="Remove ${name}">×</button></div>`);showToast(`${name} tag created.`)} return; }
  const exportButton=event.target.closest('.export-data,#exportReport'); if(exportButton){ exportCsv(exportButton.dataset.type || 'report'); return; }
});

document.addEventListener('change', event => {
  if(event.target.matches('.task-check')) { const task=state.tasks.find(t=>t.id===Number(event.target.closest('.task-row').dataset.taskId)); task.done=event.target.checked; if(task.done){ task.bucket='done'; showToast(`Task complete — recorded at ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}.`); } renderAll(); }
  if(event.target.matches('#statusFilter,#industryFilter,#tagFilter,#companySort')) renderCompanies();
  if(event.target.matches('#ownerFilter,#pipelineTagFilter,#closeFilter')) renderKanban();
  if(event.target.matches('#priorityFilter')) renderTasks();
  if(event.target.matches('[data-stage-prob]')) { const stage=state.stages.find(s=>s.name===event.target.dataset.stageProb); if(stage){stage.probability=Number(event.target.value); renderAll(); showToast(`${stage.name} probability updated.`);} }
});

document.addEventListener('input', event => { if(event.target.matches('#companySearch')) renderCompanies(); if(event.target.matches('#taskSearch')) renderTasks(); if(event.target.matches('#globalSearch')) { const q=event.target.value.trim().toLowerCase(); const results=el('searchResults'); const matches=[...state.companies.map(c=>({name:c.name,kind:'Company'})),...state.deals.map(d=>({name:d.title,kind:'Deal'}))].filter(x=>x.name.toLowerCase().includes(q)).slice(0,5); results.innerHTML=q && matches.length ? matches.map(m=>`<button data-view-go="${m.kind==='Company'?'companies':'pipeline'}"><b>${m.name}</b><small>${m.kind}</small></button>`).join('') : ''; results.classList.toggle('visible',Boolean(q && matches.length)); } });

document.querySelectorAll('.form-modal').forEach(form => form.addEventListener('submit', event => {
  event.preventDefault(); const data=new FormData(form);
  if(form.id==='companyModal') { const name=data.get('companyName'); state.companies.unshift({id:Date.now(),name,initial:name[0].toUpperCase(),logo:'logo-blue',industry:data.get('industry'),owner:'Aarav Sharma',status:data.get('status').toLowerCase(),deals:0,activity:'Just now',created:0,tags:[]}); renderCompanies(); showToast(`${name} was added to Companies.`); }
  if(form.id==='contactModal') { const name=`${data.get('firstName')} ${data.get('lastName')}`; if(state.contacts.some(c=>c.email.toLowerCase()===String(data.get('contactEmail')).toLowerCase())) { showToast('Potential duplicate email detected — review before continuing.'); return; } if(data.get('isPrimary')) state.contacts.forEach(c=>c.primary=false); state.contacts.unshift({name,initials:initials(name),title:data.get('contactTitle'),email:data.get('contactEmail'),phone:data.get('contactPhone') || '—',primary:Boolean(data.get('isPrimary'))}); renderContacts(); showToast(`${name} was added as a contact.`); }
  if(form.id==='dealModal') { const title=data.get('dealTitle'), stage=String(data.get('dealStage')).split(' ·')[0]; state.deals.unshift({id:Date.now(),title,company:data.get('dealCompany'),value:Number(data.get('dealValue')),stage,probability:Number(String(data.get('dealStage')).match(/(\d+)/)?.[0]||10),owner:data.get('dealOwner'),due:'Sep 30',month:'September',tag:''}); renderAll(); showToast(`${title} created in ${stage}.`); }
  if(form.id==='taskModal') { const title=data.get('taskTitle'), date=data.get('taskDate'), priority=data.get('taskPriority'); state.tasks.unshift({id:Date.now(),title,company:data.get('taskLink')==='No link'?'Unlinked task':data.get('taskLink'),due:date||'Today',bucket:'today',priority,done:false,assignee:data.get('taskAssignee')}); state.taskFilter='open'; renderAll(); showToast(`Task “${title}” created.`); }
  if(form.id==='activityModal') { const type=data.get('activityType'), company=data.get('activityCompany'), body=data.get('activityBody'); const icon={call:'☎',email:'✉',meeting:'▣',note:'▤'}[type]; state.activities.unshift({type,icon,text:`<strong>${type[0].toUpperCase()+type.slice(1)} logged</strong> at ${company} · ${body}`,time:'Just now'}); renderActivity(); showToast('Activity saved to the timeline.'); }
  if(form.id==='inviteModal') { showToast(`Invite sent to ${data.get('inviteEmail')}. It expires in 72 hours.`); }
  closeModal(); form.reset();
}));

el('confirmStageMove').addEventListener('click', () => { if(!state.pendingMove) return; const {deal,target}=state.pendingMove; deal.stage=target; deal.probability=target==='Won'?100:0; renderAll(); closeModal(); showToast(target==='Lost'?`${deal.title} marked lost · reason recorded: ${el('lostReason').value}.`:`${deal.title} marked won — congratulations!`); state.pendingMove=null; });
el('clearCompanyFilters').addEventListener('click',()=>{['companySearch','statusFilter','industryFilter','tagFilter'].forEach(id=>{if(id==='companySearch')el(id).value='';else el(id).value='all'});renderCompanies();});
el('globalSearch').addEventListener('keydown',e=>{if(e.key==='Escape'){el('searchResults').classList.remove('visible');e.currentTarget.value='';}});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();el('globalSearch').focus();}if(e.key==='Escape'){closeModal();el('searchResults').classList.remove('visible');}});

function exportCsv(type) { const rows=type==='companies'?[['Name','Industry','Owner','Status'],...state.companies.map(c=>[c.name,c.industry,c.owner,c.status])]:type==='contacts'?[['Name','Email','Phone'],...state.contacts.map(c=>[c.name,c.email,c.phone])]:type==='deals'?[['Title','Company','Value','Stage','Probability'],...state.deals.map(d=>[d.title,d.company,d.value,d.stage,d.probability])]:[['Rep','Won value','Deals won'],['Aarav Sharma','720000','3'],['Priya Menon','480000','2'],['Kunal Shah','220000','1']]; const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`smartpay-${type}-export.csv`;a.click();URL.revokeObjectURL(a.href);showToast(`${type[0].toUpperCase()+type.slice(1)} CSV download started.`); }

renderAll();
