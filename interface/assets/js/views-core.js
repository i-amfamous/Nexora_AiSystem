/* Views: sign in, overview, inbox, customers. */
(function () {
  var A = App, esc = UI.esc, money = UI.money;

  /* ================= Auth ================= */
  A.views.auth = function (r) {
    var mode = r.sub || 'login';
    var side = '<div class="auth-side">' +
      '<div class="row" style="gap:10px"><span class="brand-mark">N</span><span class="brand-name" style="color:#fff">NEXORA</span></div>' +
      '<div><h1>A smart way to run business.</h1><p>Customers, conversations, orders, stock, money and your team, in one workspace your whole business shares.</p>' +
      '<ul class="auth-points">' +
        '<li>' + icon('inbox', 'i-s') + '<span>Every WhatsApp, email and chat message in one inbox, with AI agents that hand over to your staff when it matters.</span></li>' +
        '<li>' + icon('shield', 'i-s') + '<span>Refunds, payments and permission changes always wait for a person to approve.</span></li>' +
        '<li>' + icon('layers', 'i-s') + '<span>Built-in inventory, sales and finance. No other software required to get started.</span></li>' +
      '</ul></div>' +
      '<div class="platforms"><span>' + icon('globe', 'i-s') + 'Web</span><span>' + icon('monitor', 'i-s') + 'Windows</span><span>' + icon('monitor', 'i-s') + 'macOS</span></div></div>';
    var form;
    if (mode === 'register') {
      form = '<form class="auth-form" id="auth-form" novalidate style="width:460px">' +
        '<div><h2>Register your business</h2><p class="muted mt-8">You will be the business owner of this workspace. You can invite your team next.</p></div>' +
        '<div class="form-grid">' +
          UI.field({ label: 'Business name', required: true, placeholder: 'Example Workspace Ltd', span: true }) +
          UI.field({ label: 'Your full name', required: true }) +
          UI.field({ label: 'Work email', type: 'email', required: true, err: 'Enter a valid email address, for example name@company.com.' }) +
          UI.field({ label: 'Phone', type: 'tel', required: true, placeholder: '+233 24 000 0000' }) +
          UI.field({ label: 'Password', type: 'password', required: true, hint: 'At least 10 characters.', err: 'Use at least 10 characters.' }) +
          UI.field({ label: 'Currency', type: 'select', options: [['GHS', 'Ghana cedi (GHS)'], ['USD', 'US dollar (USD)'], ['NGN', 'Nigerian naira (NGN)']], value: 'GHS', required: true }) +
          UI.field({ label: 'Time zone', type: 'select', options: ['Africa/Accra (GMT+0)', 'Africa/Lagos (GMT+1)', 'Europe/London (GMT+0)'], value: 'Africa/Accra (GMT+0)', required: true }) +
          UI.field({ label: 'Business address', span: true, placeholder: 'Street, city, region' }) +
        '</div>' +
        '<label class="check small"><input type="checkbox" required id="terms"><span class="muted">I agree to the Terms of Service and Privacy Policy.</span></label>' +
        '<button class="btn primary" type="submit" style="height:40px">Create workspace</button>' +
        '<p class="small muted" style="text-align:center">Already have an account? <a href="#/auth/login">Sign in</a></p></form>';
    } else if (mode === 'forgot') {
      form = '<form class="auth-form" id="auth-form" novalidate>' +
        '<div><h2>Reset your password</h2><p class="muted mt-8">Enter the email you sign in with. We will send a link that expires in 30 minutes.</p></div>' +
        UI.field({ label: 'Email', type: 'email', required: true, err: 'Enter the email address on your account.' }) +
        '<button class="btn primary" type="submit" style="height:40px">Send reset link</button>' +
        '<p class="small muted" style="text-align:center"><a href="#/auth/login">Back to sign in</a></p></form>';
    } else {
      form = '<form class="auth-form" id="auth-form" novalidate>' +
        '<div><h2>Sign in to Nexora</h2><p class="muted mt-8">Use the account your business invited you with.</p></div>' +
        UI.field({ label: 'Email', type: 'email', required: true, value: 'owner@example.test', err: 'Enter a valid email address.' }) +
        '<div class="field"><div class="row between"><label for="pw">Password</label><a class="small" href="#/auth/forgot">Forgot password?</a></div><input id="pw" class="input" type="password" required value="demo-password"><span class="err">Enter your password.</span></div>' +
        '<label class="check small"><input type="checkbox" checked><span class="muted">Keep me signed in on this device</span></label>' +
        '<button class="btn primary" type="submit" style="height:40px">Sign in</button>' +
        '<p class="small muted" style="text-align:center">New to Nexora? <a href="#/auth/register">Register your business</a></p></form>';
    }
    document.getElementById('root').innerHTML = '<div class="auth">' + side + '<div class="auth-main">' + form + '</div></div>';
    var f = document.getElementById('auth-form');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var terms = f.querySelector('#terms');
      var pw = f.querySelector('input[type=password]');
      var ok = UI.validate(f);
      if (mode === 'register' && pw && pw.value.length < 10) { pw.closest('.field').classList.add('has-err'); ok = false; }
      if (terms && !terms.checked) { ok = false; terms.parentNode.style.color = 'var(--bad)'; }
      if (!ok) return;
      if (mode === 'forgot') { UI.toast('If that email has an account, a reset link is on its way.'); location.hash = '#/auth/login'; return; }
      A.signedIn = true;
      location.hash = '#/overview';
      if (mode === 'register') setTimeout(function () { UI.toast('Workspace created. Invite your team from Employees.'); }, 50);
    });
  };

  /* ================= Overview ================= */
  A.state.range = A.state.range || '30d';
  A.views.overview = function () {
    var me = NX.employee(A.me.emp);
    var hr = new Date().getHours();
    var greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    var range = A.state.range;
    var mult = { today: 1, '7d': 7, '30d': 30, q: 90 }[range];
    var sales = NX.sales30.slice(-Math.min(30, mult)).reduce(function (a, b) { return a + b; }, 0) * (range === 'q' ? 2.86 : 1);
    var prevSales = NX.sales30prev.slice(-Math.min(30, mult)).reduce(function (a, b) { return a + b; }, 0) * (range === 'q' ? 2.86 : 1);
    var outstanding = NX.invoices.reduce(function (a, v) { return a + (v.total - v.paid); }, 0);
    var overdueAmt = NX.invoices.filter(function (v) { return v.status === 'Overdue'; }).reduce(function (a, v) { return a + v.total - v.paid; }, 0);
    var ordersN = { today: 5, '7d': 31, '30d': 128, q: 371 }[range];
    var exp = { today: 820, '7d': 16070, '30d': 48300, q: 139200 }[range];
    var delta = ((sales - prevSales) / prevSales * 100);
    var rangeLabel = { today: 'today', '7d': 'last 7 days', '30d': 'last 30 days', q: 'this quarter' }[range];

    var kpis = '<section class="kpis" aria-label="Key figures">' +
      (A.can('sales') || A.can('finance') ? kpi('Total sales', money(sales, { dp: 0 }), '<span class="' + (delta >= 0 ? 'up' : 'down') + '">' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%</span> vs previous period') : '') +
      kpi('Orders created', String(ordersN), '<span class="up">+9</span> vs previous period') +
      (A.can('finance') ? kpi('Outstanding invoices', money(outstanding, { dp: 0 }), '<span class="down">' + money(overdueAmt, { dp: 0 }) + '</span> overdue') : kpi('Unanswered conversations', '4', '2 waiting more than 15 min')) +
      (A.can('finance') ? kpi('Total expenses', money(exp, { dp: 0 }), 'Rent is 20% of spend') : kpi('Low-stock products', '3', '1 out of stock')) +
      '</section>';

    var labels = NX.sales30.map(function (_, i) { var d = new Date(2026, 10, 24 - (29 - i)); return d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]; });
    var salesCard = '<section class="card"><div class="card-head flat"><div><h2>Sales</h2><div class="sub">Daily order value, ' + rangeLabel + ', from confirmed orders</div></div>' +
      UI.legend([{ name: 'This period', color: 'var(--series-1)', line: true }, { name: 'Previous period', color: 'var(--text-3)', line: true, dashed: true }]) + '</div>' +
      '<div class="card-body">' + UI.chart('ov-sales', { type: 'line', height: 340, title: 'Daily sales', labels: labels, series: [
        { name: 'This period', values: NX.sales30, color: 'var(--series-1)' },
        { name: 'Previous period', values: NX.sales30prev, color: 'var(--text-3)', dashed: true }
      ], tipFmt: function (v) { return money(v, { dp: 0 }); } }) + '</div></section>';

    var pending = NX.approvals.filter(function (a) { return a.status === 'Pending'; });
    var attn = [];
    if (A.can('agents')) attn.push({ icon: 'shield', tone: 'warn', title: pending.length + ' approvals waiting', meta: 'Refund for Frimpong Events is the most urgent', go: '#/agents/approvals' });
    if (A.can('inbox')) attn.push({ icon: 'hand', tone: 'ai', title: '2 conversations escalated by AI', meta: 'Darko Schools (payment terms), Frimpong Events (refund)', go: '#/inbox/v6' });
    if (A.can('inventory')) attn.push({ icon: 'inventory', tone: 'bad', title: 'UPS 1500VA is out of stock', meta: '12 sold in 30 days. PR-0220 arrives 27 Nov', go: '#/inventory' });
    attn.push({ icon: 'clock', tone: 'bad', title: '2 tasks overdue', meta: 'Both are invoice follow-ups', go: '#/tasks' });
    if (A.can('automation')) attn.push({ icon: 'automation', tone: 'bad', title: 'Workflow failed: Overdue invoice reminder', meta: 'Email timeout. Retry 2 of 3 at 14:00', go: '#/automation' });
    if (A.can('integrations')) attn.push({ icon: 'integrations', tone: 'warn', title: 'Instagram needs reconnecting', meta: 'Messages from Instagram are paused', go: '#/integrations' });
    var attnCard = '<section class="card"><div class="card-head"><div><h2>Needs attention</h2><div class="sub">Sorted by urgency</div></div></div><ul class="list">' +
      attn.map(function (a) {
        var col = { warn: 'var(--warn)', bad: 'var(--bad)', ai: 'var(--ai)' }[a.tone];
        return '<li><span style="color:' + col + '">' + icon(a.icon) + '</span><div class="grow"><a class="title" href="' + a.go + '" style="color:var(--text)">' + esc(a.title) + '</a><div class="meta ellipsis">' + esc(a.meta) + '</div></div>' + icon('chevronRight', 'i-s faint') + '</li>';
      }).join('') + '</ul></section>';

    var row2 = [];
    if (A.can('inbox')) {
      row2.push('<section class="card"><div class="card-head"><div><h2>Conversations</h2><div class="sub">Last 14 days, all channels</div></div><a class="btn sm" href="#/inbox">Open inbox</a></div><div class="card-body">' +
        '<div class="row" style="gap:24px;margin-bottom:12px"><div><div class="kpi-label">Unanswered</div><div class="kpi-value" style="font-size:22px">4</div></div><div><div class="kpi-label">First response</div><div class="kpi-value" style="font-size:22px">3m 40s</div></div><div><div class="kpi-label">Resolved by AI</div><div class="kpi-value" style="font-size:22px">61%</div></div></div>' +
        UI.chart('ov-conv', { type: 'bar', height: 140, title: 'Conversations per day', labels: ['11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24'], tipLabels: ['11 Nov', '12 Nov', '13 Nov', '14 Nov', '15 Nov', '16 Nov', '17 Nov', '18 Nov', '19 Nov', '20 Nov', '21 Nov', '22 Nov', '23 Nov', '24 Nov'], series: [{ name: 'Conversations', values: NX.convVolume, color: 'var(--series-1)' }] }) +
        '</div></section>');
    }
    if (A.can('inventory')) {
      var low = NX.products.filter(function (p) { return p.stock <= p.threshold; }).sort(function (a, b) { return a.stock / a.threshold - b.stock / b.threshold; });
      row2.push('<section class="card"><div class="card-head"><div><h2>Low stock</h2><div class="sub">At or below threshold</div></div><a class="btn sm" href="#/inventory">View inventory</a></div><ul class="list">' +
        low.map(function (p) {
          var pct = Math.min(100, p.stock / p.threshold * 100);
          return '<li><div class="grow"><div class="row between"><span class="title ellipsis">' + esc(p.name) + '</span><span class="num small ' + (p.stock === 0 ? 'down' : '') + '">' + p.stock + ' / ' + p.threshold + '</span></div><div class="meter ' + (p.stock === 0 ? 'bad' : 'warn') + ' mt-8"><i style="width:' + Math.max(2, pct) + '%"></i></div></div></li>';
        }).join('') + '</ul></section>');
    }
    if (A.can('employees') || A.me.role === 'owner') {
      row2.push('<section class="card"><div class="card-head"><div><h2>Task completion</h2><div class="sub">This week, by department</div></div><a class="btn sm" href="#/tasks">View tasks</a></div><div class="card-body">' +
        UI.hbars([['Sales', 78], ['Customer support', 92], ['Inventory', 64], ['Finance', 71], ['Management', 85]], function (v) { return v + '%'; }) + '</div></section>');
    }

    var row3 = [];
    if (A.can('agents')) {
      row3.push('<section class="card"><div class="card-head"><div><h2>AI agent activity</h2><div class="sub">Today</div></div><a class="btn sm" href="#/agents">Manage agents</a></div><table class="t"><thead><tr><th>Agent</th><th class="num">Actions</th><th class="num">Escalated</th><th>Status</th></tr></thead><tbody>' +
        NX.agents.map(function (a) {
          return '<tr class="click" onclick="location.hash=\'#/agents/a/' + a.id + '\'"><td><div class="cell-2">' + UI.agentAvatar(a.short, 's') + esc(a.name) + '</div></td><td class="num">' + Math.round(a.runs / 9) + '</td><td class="num">' + Math.round(a.escal / 6) + '</td><td>' + (a.on ? '<span class="badge good">On</span>' : '<span class="badge">Off</span>') + '</td></tr>';
        }).join('') + '</tbody></table></section>');
    }
    row3.push('<section class="card"><div class="card-head"><div><h2>Recent activity</h2><div class="sub">People, AI agents and workflows</div></div>' + (A.isAdmin() ? '<a class="btn sm" href="#/settings/audit">Audit log</a>' : '') + '</div><div class="card-body"><ul class="timeline">' +
      NX.audit.slice(0, 6).map(function (e) {
        var cls = e.type === 'AI agent' ? 'ai' : e.result === 'Failed' ? 'bad' : e.result === 'Success' ? 'good' : '';
        return '<li class="' + cls + '"><div><b style="font-weight:600">' + esc(e.actor) + '</b> <span class="muted">' + esc(e.action.charAt(0).toLowerCase() + e.action.slice(1)) + '</span> ' + esc(e.res) + '</div><div class="when">' + esc(e.when.replace('24 Nov 2026, ', 'Today, ').slice(0, -3)) + (e.type !== 'Employee' ? ', ' + esc(e.type) : '') + '</div></li>';
      }).join('') + '</ul></div></section>');

    return '<div class="page">' +
      '<div class="page-head"><div><h1>' + greet + ', ' + esc(me.name.split(' ')[0]) + '</h1><p>Here is how ' + esc(NX.business.name) + ' is doing, ' + rangeLabel + '.</p></div>' +
      '<div class="actions"><div class="seg" role="group" aria-label="Date range">' +
        [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['q', 'Quarter']].map(function (o) { return '<button data-act="range" data-v="' + o[0] + '" aria-pressed="' + (range === o[0]) + '">' + o[1] + '</button>'; }).join('') +
      '</div></div></div>' +
      kpis +
      '<div class="grid g-main mt-16">' + salesCard + attnCard + '</div>' +
      (row2.length ? '<div class="grid g-' + Math.min(3, row2.length) + ' mt-16">' + row2.join('') + '</div>' : '') +
      '<div class="grid g-' + Math.min(2, row3.length) + ' mt-16">' + row3.join('') + '</div>' +
      '</div>';

    function kpi(label, value, delta) {
      var v = value.indexOf('GH') === 0 ? '<small>GH₵</small>' + value.replace(/^GH₵ /, '') : value;
      return '<div class="kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + v + '</div><div class="kpi-delta">' + delta + '</div></div>';
    }
  };
  A.actions.range = function (el) { A.state.range = el.getAttribute('data-v'); A.render(); };

  /* ================= Inbox ================= */
  A.state.inboxTab = 'all';
  A.state.composer = 'reply';
  var tabs = [['all', 'All open'], ['mine', 'Mine'], ['unassigned', 'Unassigned'], ['ai', 'AI handling'], ['resolved', 'Resolved']];
  function convFilter(c) {
    var t = A.state.inboxTab, q = (A.state.inboxQ || '').toLowerCase();
    var cust = NX.customer(c.customer);
    if (q && (cust.name + ' ' + cust.company + ' ' + c.cat).toLowerCase().indexOf(q) === -1) return false;
    if (A.state.inboxChan && c.channel !== A.state.inboxChan) return false;
    if (t === 'resolved') return c.status === 'Resolved';
    if (c.status === 'Resolved') return false;
    if (t === 'mine') return c.assignee === A.me.emp;
    if (t === 'unassigned') return !c.assignee;
    if (t === 'ai') return c.handler === 'ai';
    return true;
  }

  A.views.inbox = function (r) {
    var list = NX.conversations.filter(convFilter);
    var cur = NX.byId(NX.conversations, r.sub) || null;
    if (cur) cur.unread = false;
    var counts = {};
    tabs.forEach(function (t) { var s = A.state.inboxTab; A.state.inboxTab = t[0]; counts[t[0]] = NX.conversations.filter(convFilter).length; A.state.inboxTab = s; });

    var listHtml = '<section class="inbox-list" aria-label="Conversations"><div class="inbox-list-head">' +
      '<div class="row between"><h1 style="font-size:18px">Inbox</h1><button class="btn sm" data-act="inbox-chan">' + icon('filter', 'i-s') + (A.state.inboxChan ? NX.channels[A.state.inboxChan].name : 'All channels') + '</button></div>' +
      '<div class="input-icon">' + icon('search', 'i-s') + '<input class="input input-sm" placeholder="Search by name or topic" data-input="inbox-q" value="' + esc(A.state.inboxQ || '') + '" aria-label="Search conversations"></div>' +
      '<div class="tabs" role="tablist" style="margin:0 -16px -11px;padding:0 10px;border-bottom:0">' + tabs.map(function (t) { return '<button class="tab" role="tab" data-act="inbox-tab" data-v="' + t[0] + '" aria-selected="' + (A.state.inboxTab === t[0]) + '" style="padding:8px 6px;font-size:13px">' + t[1] + '<span class="count">' + counts[t[0]] + '</span></button>'; }).join('') + '</div>' +
      '</div><div class="convs">' +
      (list.length ? list.map(function (c) {
        var cust = NX.customer(c.customer);
        var last = c.messages.filter(function (m) { return m.dir === 'in' || m.dir === 'out'; }).slice(-1)[0];
        var asg = c.assignee ? NX.employee(c.assignee) : null;
        return '<a class="conv ' + (c.unread ? 'unread' : '') + '" href="#/inbox/' + c.id + '" aria-selected="' + (cur && cur.id === c.id) + '" style="color:inherit;text-decoration:none">' +
          UI.avatar(cust.name) + '<div class="c-body"><div class="c-top">' + (c.unread ? '<span class="unread-dot" aria-label="Unread"></span>' : '') + '<span class="c-name">' + esc(cust.name) + '</span><span class="c-time">' + c.time + '</span></div>' +
          '<div class="c-snip">' + (last.dir === 'out' ? (last.ai ? 'AI: ' : 'You: ') : '') + esc(last.text.split('\n')[0]) + '</div>' +
          '<div class="c-meta">' + UI.chan(c.channel) + UI.prio(c.prio) +
            (c.handler === 'ai' ? '<span class="badge ai">' + icon('sparkle', 'i-s') + 'AI</span>' : '<span class="badge accent">' + icon('user', 'i-s') + (asg ? esc(asg.name.split(' ')[0]) : 'Human') + '</span>') +
            (c.escalated || c.messages.some(function (m) { return m.dir === 'event' && /escalated/i.test(m.text); }) ? '<span class="badge warn">Escalated</span>' : '') +
          '</div></div></a>';
      }).join('') : UI.empty('Nothing here', 'No conversations match this view.')) +
      '</div></section>';

    var thread, ctx;
    if (!cur) {
      thread = '<section class="thread" style="align-items:center;justify-content:center">' + UI.empty('Select a conversation', 'Messages from WhatsApp, email, Telegram, website chat, Instagram and Messenger arrive here.') + '</section>';
      ctx = '<aside class="ctx"></aside>';
    } else {
      cur.unread = false;
      var cust = NX.customer(cur.customer);
      var ch = NX.channels[cur.channel];
      var aiMode = cur.handler === 'ai';
      var head = '<div class="thread-head"><button class="icon-btn" data-act="inbox-back" aria-label="Back to list" style="display:none" id="inbox-back">' + icon('chevronLeft') + '</button>' + UI.avatar(cust.name) +
        '<div style="flex:1;min-width:0"><div style="font-weight:600">' + esc(cust.name) + (cust.company ? ' <span class="muted" style="font-weight:400">' + esc(cust.company) + '</span>' : '') + '</div><div class="row small muted" style="gap:10px">' + UI.chan(cur.channel, true) + '<span>' + esc(cur.cat) + '</span></div></div>' +
        '<div class="actions">' + UI.status(cur.status) +
        (cur.status !== 'Resolved' ? '<button class="btn sm" data-act="conv-resolve">' + icon('check', 'i-s') + 'Resolve</button>' : '<button class="btn sm" data-act="conv-reopen">Reopen</button>') +
        '<button class="icon-btn" data-act="toggle-ctx" aria-label="Show customer details">' + icon('panel') + '</button></div></div>';

      var handler = aiMode
        ? '<div class="handler ai" role="status">' + UI.agentAvatar(NX.agents.filter(function (a) { return a.name === cur.agent; })[0].short, 's') + '<div class="h-text"><b>' + esc(cur.agent) + '</b> is replying to this conversation. It uses live product, stock and order records and cannot approve refunds or confirm payments.</div><button class="btn primary sm" data-act="takeover">' + icon('hand', 'i-s') + 'Take over</button></div>'
        : '<div class="handler human" role="status">' + icon('user', 'i-s') + '<div class="h-text"><b>Human controlled.</b> AI will not send replies here. ' + (cur.assignee ? esc(NX.employee(cur.assignee).name) + ' is responsible.' : '') + '</div><button class="btn sm" data-act="handback">' + icon('sparkle', 'i-s') + 'Hand back to AI</button></div>';

      var msgs = '<div class="messages" id="msgs"><div class="day-sep">Today</div>' + cur.messages.map(function (m) {
        if (m.dir === 'event') return '<div class="sys-event">' + icon(/escalat/i.test(m.text) ? 'flag' : /took over/i.test(m.text) ? 'hand' : 'sparkle', 'i-s') + esc(m.text) + '</div>';
        if (m.dir === 'trace') return '<div class="tool-trace" title="Backend tools the agent used to get authoritative data">' + icon('layers', 'i-s') + ' Looked up: <code>' + esc(m.text) + '</code></div>';
        if (m.dir === 'note') return '<div class="msg note"><div class="bubble">' + icon('note', 'i-s') + ' ' + esc(m.text) + '</div><div class="m-meta" style="justify-content:center">Internal note, not visible to customer, ' + m.at + '</div></div>';
        var who = m.dir === 'in' ? esc(cust.name.split(' ')[0]) : m.ai ? esc(cur.agent || 'AI agent') : m.by ? esc(NX.employee(m.by).name.split(' ')[0]) : 'You';
        var st = m.status ? (m.status === 'read' ? icon('checks', 'i-s') + 'Read' : m.status === 'delivered' ? icon('checks', 'i-s') + 'Delivered' : icon('check', 'i-s') + 'Sent') : '';
        return '<div class="msg ' + m.dir + (m.ai ? ' by-ai' : '') + '"><div class="bubble">' + esc(m.text) + (m.attach ? '\n<span class="tag mt-8">' + icon('paperclip', 'i-s') + '&nbsp;' + esc(m.attach) + '</span>' : '') + '</div><div class="m-meta">' + (m.ai ? icon('sparkle', 'i-s') : '') + who + ', ' + m.at + (st ? '<span class="row" style="gap:3px">' + st + '</span>' : '') + '</div></div>';
      }).join('') + '</div>';

      var draft = cur.draft && !aiMode ? '<div class="draft"><div class="draft-head">' + icon('sparkle', 'i-s') + 'Suggested reply from ' + esc(cur.agent || 'Sales Agent') + '<span class="faint" style="font-weight:400;margin-left:auto">Not sent. Review before sending.</span></div><div class="draft-body">' + esc(cur.draft) + '</div><div class="draft-foot"><button class="btn sm ghost" data-act="draft-discard">Discard</button><button class="btn sm" data-act="draft-edit">Edit</button><button class="btn sm primary" data-act="draft-send">Send as is</button></div></div>'
        : cur.draft && aiMode ? '<div class="draft"><div class="draft-head">' + icon('clock', 'i-s') + 'Waiting for a person<span class="faint" style="font-weight:400;margin-left:auto">The agent escalated this conversation</span></div><div class="draft-body">' + esc(cur.draft) + '</div><div class="draft-foot"><span class="small muted" style="margin-right:auto">Take over above to review, edit and send this reply.</span></div></div>' : '';

      var winNote = cur.channel === 'whatsapp' ? 'WhatsApp allows free-form replies for 23 h 31 min. After that, use an approved template.' : cur.channel === 'email' ? 'Replies are sent from ' + NX.business.email + '.' : 'Replying on ' + ch.name + '.';
      var mode = A.state.composer;
      var composer = '<div class="composer ' + (mode === 'note' ? 'note-mode' : '') + '">' +
        '<div class="composer-tabs"><button data-act="composer" data-v="reply" aria-pressed="' + (mode === 'reply') + '">Reply on ' + ch.name + '</button><button data-act="composer" data-v="note" aria-pressed="' + (mode === 'note') + '">Internal note</button></div>' +
        (aiMode && mode === 'reply'
          ? '<div class="callout ai">' + icon('sparkle') + '<div style="flex:1">' + esc(cur.agent) + ' is handling replies. Take over to write to the customer yourself, or switch to Internal note to brief your team.</div></div>'
          : '<textarea id="reply" aria-label="' + (mode === 'note' ? 'Internal note' : 'Reply') + '" placeholder="' + (mode === 'note' ? 'Write a note your team can see. Mention someone with @.' : 'Write a reply to ' + esc(cust.name.split(' ')[0])) + '"></textarea>' +
            '<div class="composer-bar"><button class="icon-btn" data-act="attach" aria-label="Attach file">' + icon('paperclip') + '</button>' +
            (mode === 'reply' ? '<button class="btn sm ai" data-act="ai-draft">' + icon('sparkle', 'i-s') + 'Draft with AI</button><span class="small faint" style="margin-left:6px">' + esc(winNote) + '</span>' : '') +
            '<span style="flex:1"></span><button class="btn primary sm" data-act="send">' + icon('send', 'i-s') + (mode === 'note' ? 'Add note' : 'Send') + '</button></div>') +
        '</div>';

      thread = '<section class="thread" aria-label="Conversation">' + head + handler + msgs + draft + composer + '</section>';

      var orders = NX.orders.filter(function (o) { return o.customer === cust.id; }).slice(0, 3);
      var empOpts = NX.employees.filter(function (e) { return e.status === 'active' && ['sales', 'support', 'manager', 'finance', 'owner', 'admin'].indexOf(e.role) > -1; }).map(function (e) { return [e.id, e.name]; });
      ctx = '<aside class="ctx" aria-label="Customer details">' +
        '<div class="ctx-sec"><div class="row" style="gap:12px">' + UI.avatar(cust.name, 'l') + '<div style="min-width:0"><div style="font-weight:600">' + esc(cust.name) + '</div><div class="small muted">' + esc(cust.company || 'Individual customer') + '</div></div></div>' +
          '<dl class="kv mt-12"><dt>Phone</dt><dd>' + esc(cust.phone) + '</dd><dt>Email</dt><dd>' + esc(cust.email) + '</dd><dt>City</dt><dd>' + esc(cust.city) + '</dd><dt>Lifetime</dt><dd class="num">' + money(cust.value, { dp: 0 }) + ', ' + cust.orders + ' orders</dd></dl>' +
          '<div class="row wrap mt-12" style="gap:6px">' + cust.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>' +
          '<a class="btn sm mt-12" href="#/customers/c/' + cust.id + '">Open customer</a></div>' +
        '<div class="ctx-sec"><h3>Handling</h3><div class="stack" style="gap:10px">' +
          '<div class="field"><label for="asg">Assigned to</label><select id="asg" class="input input-sm" data-change="conv-assign"><option value="">Unassigned</option>' + empOpts.map(function (o) { return '<option value="' + o[0] + '"' + (cur.assignee === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>' +
          '<div class="field"><label for="pri">Priority</label><select id="pri" class="input input-sm" data-change="conv-prio">' + ['Low', 'Normal', 'High', 'Urgent'].map(function (p, i) { return '<option value="' + (i + 1) + '"' + (cur.prio === i + 1 ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></div>' +
          '<div class="field"><label for="cat">Category</label><select id="cat" class="input input-sm" data-change="conv-cat">' + ['Order enquiry', 'Product question', 'Delivery', 'Payment', 'Invoice', 'Complaint', 'Other'].map(function (p) { return '<option' + (cur.cat === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></div>' +
        '</div></div>' +
        '<div class="ctx-sec"><div class="row between" style="margin-bottom:10px"><h3 style="margin:0">Recent orders</h3>' + (A.can('orders') ? '<button class="btn ghost sm" data-act="new-order" data-customer="' + cust.id + '">' + icon('plus', 'i-s') + 'New</button>' : '') + '</div>' +
          (orders.length ? '<div class="stack" style="gap:8px">' + orders.map(function (o) { return '<a href="#/orders/o/' + o.id + '" class="row between small" style="color:var(--text)"><span><b style="font-weight:600">' + o.id + '</b><br><span class="faint">' + esc(o.date) + '</span></span><span style="text-align:right"><span class="num">' + money(NX.orderTotal(o), { dp: 0 }) + '</span><br>' + UI.status(o.status) + '</span></a>'; }).join('') + '</div>' : '<p class="small muted">No orders yet.</p>') +
        '</div>' +
        '<div class="ctx-sec"><h3>Channel</h3><div class="row small" style="gap:8px"><i class="dot"></i>' + ch.name + ' connected</div><p class="small faint mt-8">Delivery and read receipts shown where the channel provides them.</p></div>' +
        '</aside>';
    }
    return '<div class="page fill"><div class="inbox ' + (cur ? 'open' : '') + (A.state.showCtx ? ' show-ctx' : '') + '" id="inbox">' + listHtml + thread + ctx + '</div></div>';
  };
  A.mounts.inbox = function (c) {
    var m = c.querySelector('#msgs');
    if (m) m.scrollTop = m.scrollHeight;
    var b = c.querySelector('#inbox-back');
    if (b && window.innerWidth <= 900) b.style.display = '';
    A.renderNav();
  };
  function curConv() { return NX.byId(NX.conversations, A.route().sub); }
  function nowTime() { var d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  A.actions['inbox-tab'] = function (el) { A.state.inboxTab = el.getAttribute('data-v'); A.render(); };
  A.actions['inbox-q'] = function (el) {
    A.state.inboxQ = el.value; var pos = el.selectionStart; A.render();
    var n = document.querySelector('[data-input="inbox-q"]'); n.focus(); n.setSelectionRange(pos, pos);
  };
  A.actions['inbox-chan'] = function (el) {
    var items = [{ label: 'All channels', checked: !A.state.inboxChan, fn: function () { A.state.inboxChan = ''; A.render(); } }, 'sep'];
    Object.keys(NX.channels).forEach(function (k) { items.push({ label: NX.channels[k].name, checked: A.state.inboxChan === k, fn: function () { A.state.inboxChan = k; A.render(); } }); });
    UI.menu(el, items);
  };
  A.actions['inbox-back'] = function () { location.hash = '#/inbox'; };
  A.actions['toggle-ctx'] = function () { A.state.showCtx = !A.state.showCtx; document.getElementById('inbox').classList.toggle('show-ctx', A.state.showCtx); };
  A.actions.composer = function (el) { A.state.composer = el.getAttribute('data-v'); A.render(); var t = document.getElementById('reply'); if (t) t.focus(); };
  A.actions.takeover = function () {
    var c = curConv(); var me = NX.employee(A.me.emp);
    c.handler = 'human'; c.assignee = A.me.emp; A.state.composer = 'reply';
    c.messages.push({ dir: 'event', text: me.name + ' took over from ' + c.agent });
    NX.audit.unshift({ when: '24 Nov 2026, ' + nowTime() + ':00', actor: me.name, type: 'Employee', action: 'Took over conversation from AI', res: 'Conversation ' + c.id, result: 'Success', approval: '' });
    A.render(); UI.toast('You are now handling this conversation. AI replies are paused.');
    var t = document.getElementById('reply'); if (t) t.focus();
  };
  A.actions.handback = function () {
    var c = curConv(); var me = NX.employee(A.me.emp);
    c.handler = 'ai'; c.agent = c.agent || 'Customer Support Agent';
    c.messages.push({ dir: 'event', text: me.name + ' handed the conversation back to ' + c.agent });
    A.render(); UI.toast('Handed back to ' + c.agent);
  };
  A.actions.send = function () {
    var c = curConv(), t = document.getElementById('reply');
    if (!t.value.trim()) { t.focus(); t.style.borderColor = 'var(--bad)'; t.placeholder = 'Write something before sending.'; return; }
    if (A.state.composer === 'note') c.messages.push({ dir: 'note', text: t.value.trim(), at: nowTime() });
    else c.messages.push({ dir: 'out', text: t.value.trim(), at: nowTime(), status: 'sent', by: A.me.emp });
    c.time = nowTime();
    A.render(); UI.toast(A.state.composer === 'note' ? 'Note added' : 'Message sent on ' + NX.channels[c.channel].name);
  };
  A.actions['ai-draft'] = function () {
    var c = curConv();
    var t = document.getElementById('reply');
    t.value = c.draft || 'Thank you for your message. Let me check this for you and come back to you shortly.';
    t.focus();
    UI.toast('Draft added. Review before sending.');
  };
  A.actions['draft-send'] = function () { var c = curConv(); c.messages.push({ dir: 'out', text: c.draft, at: nowTime(), status: 'sent', by: A.me.emp }); c.draft = null; A.render(); UI.toast('Message sent on ' + NX.channels[c.channel].name); };
  A.actions['draft-edit'] = function () { var c = curConv(); var d = c.draft; c.draft = null; A.state.composer = 'reply'; A.render(); var t = document.getElementById('reply'); t.value = d; t.focus(); };
  A.actions['draft-discard'] = function () { var c = curConv(); var d = c.draft; c.draft = null; A.render(); UI.toast('Suggestion discarded', function () { c.draft = d; A.render(); }); };
  A.actions['conv-resolve'] = function () { var c = curConv(); c.status = 'Resolved'; A.render(); UI.toast('Conversation resolved', function () { c.status = 'Open'; A.render(); }); };
  A.actions['conv-reopen'] = function () { var c = curConv(); c.status = 'Open'; A.render(); };
  A.actions['conv-assign'] = function (el) { var c = curConv(); c.assignee = el.value || null; A.render(); UI.toast(el.value ? 'Assigned to ' + NX.employee(el.value).name : 'Conversation unassigned'); };
  A.actions['conv-prio'] = function (el) { curConv().prio = +el.value; A.render(); };
  A.actions['conv-cat'] = function (el) { curConv().cat = el.value; A.render(); };
  A.actions.attach = function () { UI.toast('Attachments up to 16 MB are sent where the channel supports them.'); };

  /* ================= Customers ================= */
  A.state.custSort = { k: 'value', d: -1 };
  A.views.customers = function (r) {
    var q = (A.state.custQ || '').toLowerCase(), tag = A.state.custTag || '';
    var rows = NX.customers.filter(function (c) {
      return (!q || (c.name + ' ' + c.company + ' ' + c.phone + ' ' + c.email + ' ' + c.city).toLowerCase().indexOf(q) > -1) && (!tag || c.tags.indexOf(tag) > -1);
    });
    var s = A.state.custSort;
    rows.sort(function (a, b) { var x = a[s.k], y = b[s.k]; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * s.d; });
    var tags = [];
    NX.customers.forEach(function (c) { c.tags.forEach(function (t) { if (tags.indexOf(t) === -1) tags.push(t); }); });
    var dups = NX.customers.filter(function (c) { return c.duplicateOf; });
    var th = function (k, l, cls) { return '<th class="sortable ' + (cls || '') + '" data-act="cust-sort" data-k="' + k + '" aria-sort="' + (s.k === k ? (s.d > 0 ? 'ascending' : 'descending') : 'none') + '">' + l + (s.k === k ? ' ' + icon(s.d > 0 ? 'arrowUp' : 'arrowDown', 'i-s') : '') + '</th>'; };
    return '<div class="page"><div class="page-head"><div><h1>Customers</h1><p>' + NX.customers.length + ' customers. Linked to their conversations, orders and invoices.</p></div><div class="actions"><button class="btn" data-act="export">' + icon('download', 'i-s') + 'Export</button><button class="btn primary" data-act="new-customer">' + icon('plus', 'i-s') + 'New customer</button></div></div>' +
      (dups.length ? '<div class="callout warn" style="margin-bottom:16px">' + icon('merge') + '<div style="flex:1"><b>Possible duplicate.</b> ' + esc(dups[0].name) + ' shares a phone number with ' + esc(NX.customer(dups[0].duplicateOf).name) + ' (' + esc(NX.customer(dups[0].duplicateOf).company) + ').</div><button class="btn sm" data-act="review-dup" data-id="' + dups[0].id + '">Review</button></div>' : '') +
      '<div class="card"><div class="toolbar"><div class="input-icon" style="width:300px;max-width:100%">' + icon('search', 'i-s') + '<input class="input input-sm" placeholder="Search name, company, phone or email" data-input="cust-q" value="' + esc(A.state.custQ || '') + '" aria-label="Search customers"></div>' +
        '<select class="input input-sm" style="width:auto" data-change="cust-tag" aria-label="Filter by tag"><option value="">All tags</option>' + tags.map(function (t) { return '<option' + (t === tag ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' +
        '<span class="small faint" style="margin-left:auto">' + rows.length + ' shown</span></div>' +
      '<div class="table-wrap"><table class="t"><thead><tr>' + th('name', 'Customer') + '<th>Contact</th>' + th('city', 'City') + '<th>Tags</th>' + th('orders', 'Orders', 'num') + th('value', 'Lifetime value', 'num') + '<th>Owner</th><th>Last activity</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (c) {
        var o = NX.employee(c.owner);
        return '<tr class="click" data-act="open-customer" data-id="' + c.id + '" tabindex="0"><td><div class="cell-2">' + UI.avatar(c.name) + '<div><div class="strong">' + esc(c.name) + (c.duplicateOf ? ' <span class="badge warn" style="margin-left:4px">Possible duplicate</span>' : '') + '</div><div class="l2">' + esc(c.company || 'Individual') + '</div></div></div></td>' +
          '<td><div class="small">' + esc(c.phone) + '</div><div class="small faint">' + esc(c.email) + '</div></td><td>' + esc(c.city) + '</td><td><div class="row wrap" style="gap:4px">' + c.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div></td>' +
          '<td class="num">' + c.orders + '</td><td class="num">' + money(c.value) + '</td><td><div class="cell-2">' + UI.avatar(o.name, 's') + '<span class="small">' + esc(o.name.split(' ')[0]) + '</span></div></td><td class="small muted">' + esc(c.last) + '</td></tr>';
      }).join('') : '<tr><td colspan="8">' + UI.empty('No customers match', 'Try a different name or clear the tag filter.') + '</td></tr>') +
      '</tbody></table></div><div class="pager"><span>Showing 1 to ' + rows.length + ' of ' + rows.length + '</span><div class="row"><button class="btn sm" disabled>Previous</button><button class="btn sm" disabled>Next</button></div></div></div></div>';
  };
  A.mounts.customers = function (c, r) { if (r.sub === 'c' && r.id) openCustomer(r.id); };
  A.actions['cust-sort'] = function (el) { var k = el.getAttribute('data-k'), s = A.state.custSort; if (s.k === k) s.d *= -1; else { s.k = k; s.d = k === 'name' || k === 'city' ? 1 : -1; } A.render(); };
  A.actions['cust-q'] = function (el) { A.state.custQ = el.value; var p = el.selectionStart; A.render(); var n = document.querySelector('[data-input="cust-q"]'); n.focus(); n.setSelectionRange(p, p); };
  A.actions['cust-tag'] = function (el) { A.state.custTag = el.value; A.render(); };
  A.actions['open-customer'] = function (el) { openCustomer(el.getAttribute('data-id')); };
  A.actions.export = function () { UI.toast('Export started. You will be notified when the CSV is ready to download.'); };
  A.actions['review-dup'] = function (el) {
    var d = NX.customer(el.getAttribute('data-id')), o = NX.customer(d.duplicateOf);
    var row = function (l, a, b) { return '<tr><td class="muted">' + l + '</td><td>' + esc(a) + '</td><td>' + esc(b) + '</td></tr>'; };
    UI.modal({ title: 'Review possible duplicate', wide: true, ok: 'Merge into ' + o.name,
      body: '<p class="muted" style="margin-bottom:12px">Merging moves conversations, orders and notes to the record you keep. The other record is archived, and the merge is recorded in the audit log.</p><div class="table-wrap card"><table class="t"><thead><tr><th></th><th>Keep: ' + esc(o.name) + '</th><th>Merge: ' + esc(d.name) + '</th></tr></thead><tbody>' +
        row('Company', o.company, d.company) + row('Phone', o.phone, d.phone) + row('Email', o.email, d.email) + row('Orders', o.orders, d.orders) + row('Since', o.since, d.since) + '</tbody></table></div>',
      onOk: function () { o.orders += d.orders; o.value += d.value; NX.customers.splice(NX.customers.indexOf(d), 1); A.render(); UI.toast('Customers merged'); }
    });
  };
  function openCustomer(id) {
    var c = NX.customer(id); if (!c) return;
    var orders = NX.orders.filter(function (o) { return o.customer === id; });
    var convs = NX.conversations.filter(function (v) { return v.customer === id; });
    var inv = NX.invoices.filter(function (v) { return v.customer === id; });
    var bal = inv.reduce(function (a, v) { return a + v.total - v.paid; }, 0);
    UI.drawer({ title: c.name,
      head: '<div class="row" style="gap:12px">' + UI.avatar(c.name, 'l') + '<div><h2>' + esc(c.name) + '</h2><div class="small muted">' + esc(c.company || 'Individual customer') + ', ' + esc(c.city) + '</div></div></div>',
      body: '<div class="grid g-3" style="gap:10px;margin-bottom:18px">' +
          '<div class="card card-body" style="padding:12px"><div class="kpi-label">Lifetime value</div><div class="num" style="font-weight:600;font-size:16px">' + money(c.value, { dp: 0 }) + '</div></div>' +
          '<div class="card card-body" style="padding:12px"><div class="kpi-label">Orders</div><div class="num" style="font-weight:600;font-size:16px">' + c.orders + '</div></div>' +
          '<div class="card card-body" style="padding:12px"><div class="kpi-label">Balance due</div><div class="num" style="font-weight:600;font-size:16px;' + (bal ? 'color:var(--bad)' : '') + '">' + money(bal, { dp: 0 }) + '</div></div></div>' +
        '<h3 style="margin-bottom:8px">Contact</h3><dl class="kv"><dt>Phone</dt><dd>' + esc(c.phone) + '</dd><dt>Email</dt><dd>' + esc(c.email) + '</dd><dt>Customer since</dt><dd>' + esc(c.since) + '</dd><dt>Account owner</dt><dd>' + esc(NX.employee(c.owner).name) + '</dd><dt>Identifiers</dt><dd>WhatsApp ' + esc(c.phone) + '<br>Email ' + esc(c.email) + '</dd></dl>' +
        '<h3 style="margin:18px 0 8px">Tags</h3><div class="row wrap" style="gap:6px">' + c.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '<button class="btn ghost sm" data-act="add-tag" data-id="' + c.id + '">' + icon('plus', 'i-s') + 'Add tag</button></div>' +
        '<h3 style="margin:18px 0 8px">Conversations</h3>' + (convs.length ? convs.map(function (v) { return '<a class="row between" style="padding:8px 0;border-bottom:1px solid var(--border);color:var(--text)" href="#/inbox/' + v.id + '"><span class="row">' + UI.chan(v.channel) + esc(v.cat) + '</span>' + UI.status(v.status) + '</a>'; }).join('') : '<p class="small muted">No conversations yet.</p>') +
        '<h3 style="margin:18px 0 8px">Orders</h3>' + (orders.length ? orders.map(function (o) { return '<a class="row between" style="padding:8px 0;border-bottom:1px solid var(--border);color:var(--text)" href="#/orders/o/' + o.id + '"><span><b style="font-weight:600">' + o.id + '</b> <span class="faint small">' + esc(o.date) + '</span></span><span class="row"><span class="num">' + money(NX.orderTotal(o), { dp: 0 }) + '</span>' + UI.status(o.status) + '</span></a>'; }).join('') : '<p class="small muted">No orders yet.</p>') +
        '<h3 style="margin:18px 0 8px">Internal notes</h3><div class="callout"><div>Prefers delivery before 10:00. Gate code at the side entrance. <span class="faint">Esi Quaye, 12 Nov</span></div></div>' +
        '<textarea class="input mt-8" placeholder="Add a note for your team" aria-label="New note"></textarea>',
      foot: '<button class="btn" data-act="edit-customer" data-id="' + c.id + '">' + icon('edit', 'i-s') + 'Edit</button>' + (A.can('orders') ? '<button class="btn primary" data-act="new-order" data-customer="' + c.id + '">' + icon('plus', 'i-s') + 'New order</button>' : '')
    });
  }
  A.actions['add-tag'] = function (el) {
    var c = NX.customer(el.getAttribute('data-id'));
    UI.modal({ title: 'Add tag', body: UI.field({ label: 'Tag', required: true, placeholder: 'For example VIP' }), ok: 'Add tag',
      onOk: function (m) { if (!UI.validate(m)) return false; c.tags.push(m.querySelector('input').value.trim()); A.render(); UI.toast('Tag added'); } });
  };
  function customerForm(c) {
    c = c || {};
    return '<div class="form-grid">' + UI.field({ label: 'Full name', required: true, value: c.name, name: 'name' }) + UI.field({ label: 'Company', value: c.company, name: 'company' }) +
      UI.field({ label: 'Phone', type: 'tel', required: true, value: c.phone, placeholder: '+233 24 000 0000', name: 'phone', hint: 'Used to match WhatsApp messages.' }) + UI.field({ label: 'Email', type: 'email', value: c.email, name: 'email', err: 'Enter a valid email address.' }) +
      UI.field({ label: 'City', value: c.city, name: 'city' }) + UI.field({ label: 'Account owner', type: 'select', options: NX.employees.filter(function (e) { return e.role === 'sales' || e.role === 'manager'; }).map(function (e) { return [e.id, e.name]; }), value: c.owner || A.me.emp, name: 'owner', required: true }) + '</div>';
  }
  function readForm(m) { var o = {}; m.querySelectorAll('[name]').forEach(function (i) { o[i.name] = i.value.trim(); }); return o; }
  A.readForm = readForm;
  A.actions['new-customer'] = function () {
    UI.modal({ title: 'New customer', body: customerForm(), ok: 'Create customer',
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var f = readForm(m);
        var dup = NX.customers.filter(function (c) { return c.phone.replace(/\s/g, '') === f.phone.replace(/\s/g, ''); })[0];
        var id = 'c' + (NX.customers.length + 20);
        NX.customers.unshift({ id: id, name: f.name, company: f.company, phone: f.phone, email: f.email, city: f.city || 'Accra', tags: ['New'], value: 0, orders: 0, since: 'Nov 2026', owner: f.owner, last: 'Just now', duplicateOf: dup ? dup.id : undefined });
        location.hash = '#/customers'; A.render();
        UI.toast(dup ? 'Customer created. It may duplicate ' + dup.name + '.' : 'Customer created');
      } });
  };
  A.actions['edit-customer'] = function (el) {
    var c = NX.customer(el.getAttribute('data-id'));
    UI.modal({ title: 'Edit customer', body: customerForm(c), ok: 'Save changes',
      onOk: function (m) { if (!UI.validate(m)) return false; var f = readForm(m); Object.keys(f).forEach(function (k) { c[k] = f[k]; }); A.render(); UI.toast('Customer updated'); } });
  };
})();
