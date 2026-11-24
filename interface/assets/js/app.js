/* App shell: routing, navigation by role, command palette, notifications. */
(function () {
  var A = { views: {}, mounts: {}, actions: {}, state: {}, apiMode: true, permissions: [], identity: null };

  A.personas = [
    { emp: 'e1', role: 'owner' },
    { emp: 'e2', role: 'admin' },
    { emp: 'e3', role: 'manager' },
    { emp: 'e4', role: 'sales' },
    { emp: 'e6', role: 'support' },
    { emp: 'e8', role: 'inventory' },
    { emp: 'e9', role: 'finance' }
  ];
  A.me = A.personas[0];

  var ALL = ['owner', 'admin', 'manager', 'sales', 'support', 'inventory', 'finance'];
  A.nav = [
    { group: '', items: [
      { id: 'overview', label: 'Overview', icon: 'overview', roles: ALL },
      { id: 'inbox', label: 'Inbox', icon: 'inbox', roles: ['owner', 'admin', 'manager', 'sales', 'support'], count: function () { return NX.conversations.filter(function (c) { return c.unread; }).length; } },
      { id: 'tasks', label: 'Tasks', icon: 'tasks', roles: ALL, count: function () { return NX.tasks.filter(function (t) { return t.overdue; }).length; }, alert: true }
    ] },
    { group: 'Business', items: [
      { id: 'customers', label: 'Customers', icon: 'customers', roles: ['owner', 'admin', 'manager', 'sales', 'support'] },
      { id: 'sales', label: 'Sales', icon: 'sales', roles: ['owner', 'admin', 'manager', 'sales'] },
      { id: 'orders', label: 'Orders', icon: 'orders', roles: ['owner', 'admin', 'manager', 'sales', 'inventory', 'finance'] },
      { id: 'inventory', label: 'Products and inventory', icon: 'inventory', roles: ['owner', 'admin', 'manager', 'sales', 'inventory'] },
      { id: 'finance', label: 'Finance', icon: 'finance', roles: ['owner', 'admin', 'finance'] }
    ] },
    { group: 'Team and automation', items: [
      { id: 'employees', label: 'Employees', icon: 'employees', roles: ['owner', 'admin', 'manager'] },
      { id: 'automation', label: 'Automation', icon: 'automation', roles: ['owner', 'admin', 'manager'] },
      { id: 'agents', label: 'AI agents', icon: 'agents', roles: ['owner', 'admin', 'manager'], count: function () { return NX.approvals.filter(function (a) { return a.status === 'Pending'; }).length; } },
      { id: 'analytics', label: 'Analytics', icon: 'analytics', roles: ['owner', 'admin', 'manager', 'finance'] }
    ] },
    { group: 'Workspace', items: [
      { id: 'integrations', label: 'Integrations', icon: 'integrations', roles: ['owner', 'admin'] },
      { id: 'settings', label: 'Settings', icon: 'settings', roles: ALL }
    ] }
  ];

  A.pagePermissions = {
    overview: 'business:read', inbox: 'inbox:read', tasks: 'tasks:read', customers: 'customers:read',
    sales: 'sales:read', orders: 'orders:read', inventory: 'inventory:read', finance: 'finance:read',
    employees: 'employees:read', automation: 'workflows:read', agents: 'agents:read',
    analytics: 'analytics:read', integrations: 'integrations:read', settings: 'business:read'
  };
  A.can = function (page) {
    var roleAllowed = false;
    for (var g = 0; g < A.nav.length; g++) for (var i = 0; i < A.nav[g].items.length; i++) {
      var it = A.nav[g].items[i];
      if (it.id === page) roleAllowed = it.roles.indexOf(A.me.role) !== -1;
    }
    var permission = A.pagePermissions[page];
    var permissionAllowed = !A.apiMode || !permission || !A.permissions.length || A.permissions.indexOf(permission) !== -1;
    return roleAllowed && permissionAllowed;
  };
  A.isAdmin = function () { return A.me.role === 'owner' || A.me.role === 'admin'; };
  A.applyIdentity = function (me, context, permissions) {
    A.identity = me;
    A.permissions = permissions || [];
    A.me = { emp: me.employeeId || me.id, role: me.role || context.role };
    A.context = context;
  };
  A.signOut = async function () {
    try { await NXApi.request('POST', '/auth/logout', {}); } catch (e) {}
    NXApi.clearToken();
    NXApi.stopRealtime();
    A.signedIn = false;
    A.identity = null;
    A.permissions = [];
    location.hash = '#/auth/login';
    A.render();
    UI.toast('Signed out securely');
  };

  A.route = function () {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('/');
    return { page: parts[0] || 'overview', sub: parts[1] || '', id: parts[2] || '' };
  };
  A.go = function (hash) { if (location.hash === hash) A.render(); else location.hash = hash; };

  /* ---------- Shell ---------- */
  A.renderShell = function () {
    var me = NX.employee(A.me.emp);
    var role = NX.role(A.me.role);
    var unread = NX.notifications.filter(function (n) { return n.unread; }).length;
    document.getElementById('root').innerHTML =
      '<div class="app">' +
      '<aside class="sidebar" aria-label="Main navigation">' +
        '<div class="brand"><span class="brand-mark">N</span><span class="brand-name">NEXORA</span></div>' +
        '<button class="workspace-switch" data-act="workspace-menu" aria-label="Switch workspace"><span class="ws-logo">' + NX.business.short + '</span><span class="ws-meta"><span class="ws-name" style="display:block">' + UI.esc(NX.business.name) + '</span><span class="ws-sub">' + UI.esc(NX.business.plan) + ' plan</span></span>' + icon('chevronDown', 'i-s') + '</button>' +
        '<nav class="nav" id="nav"></nav>' +
        '<div class="sidebar-foot"><div class="me">' + UI.avatar(me.name) + '<div class="me-meta"><div class="me-name">' + UI.esc(me.name) + '</div><div class="me-role">' + UI.esc(role.name) + '</div></div><button class="icon-btn" data-act="user-menu" aria-label="Account menu">' + icon('more') + '</button></div></div>' +
      '</aside>' +
      '<div class="main">' +
        '<header class="topbar">' +
          '<button class="search" data-act="palette" aria-label="Search or jump to">' + icon('search', 'i-s') + '<span>Search customers, orders, products</span><kbd>' + (navigator.platform.indexOf('Mac') > -1 ? '⌘' : 'Ctrl') + ' K</kbd></button>' +
          '<div class="topbar-spacer"></div>' +
          '<span class="sync-state" title="Connected to the Nexora server. Changes from other devices appear automatically."><i class="dot"></i><span>Live</span></span>' +
          '<button class="btn sm" data-act="quick-create">' + icon('plus', 'i-s') + 'New</button>' +
          '<button class="icon-btn" data-act="theme" aria-label="Switch light or dark theme">' + icon(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon') + '</button>' +
          '<button class="icon-btn" data-act="notifications" aria-label="Notifications, ' + unread + ' unread">' + icon('bell') + (unread ? '<span class="badge-dot"></span>' : '') + '</button>' +
        '</header>' +
        '<main class="content" id="content" tabindex="-1"></main>' +
      '</div></div>';
  };

  A.renderNav = function () {
    var r = A.route();
    var html = '';
    A.nav.forEach(function (g) {
      var items = g.items.filter(function (it) { return it.roles.indexOf(A.me.role) !== -1 && A.can(it.id); });
      if (!items.length) return;
      html += '<div class="nav-group">' + (g.group ? '<div class="nav-group-label">' + g.group + '</div>' : '');
      items.forEach(function (it) {
        var c = it.count ? it.count() : 0;
        html += '<a class="nav-item" href="#/' + it.id + '"' + (r.page === it.id ? ' aria-current="page"' : '') + ' title="' + it.label + '">' + icon(it.icon) + '<span>' + it.label + '</span>' + (c ? '<span class="count' + (it.alert ? ' alert' : '') + '">' + c + '</span>' : '') + '</a>';
      });
      html += '</div>';
    });
    document.getElementById('nav').innerHTML = html;
  };

  A.render = function () {
    if (!A.signedIn) { A.views.auth(A.route()); return; }
    if (!document.getElementById('nav')) A.renderShell();
    var r = A.route();
    if (r.page === 'auth') { location.hash = '#/overview'; return; }
    A.renderNav();
    var c = document.getElementById('content');
    UI.charts = {};
    if (!A.can(r.page)) {
      c.innerHTML = '<div class="page">' + UI.empty('You do not have access to this area', 'Your role (' + NX.role(A.me.role).name + ') does not include this module. Ask a workspace administrator if you need access.', '<a class="btn" href="#/overview">Go to overview</a>') + '</div>';
      return;
    }
    var view = A.views[r.page] || A.views.overview;
    c.innerHTML = view(r);
    if (A.mounts[r.page]) A.mounts[r.page](c, r);
    UI.drawCharts(c);
    var title = (document.querySelector('.page-head h1') || {}).textContent;
    document.title = (title ? title + ' | ' : '') + 'Nexora';
  };

  /* ---------- Global actions ---------- */
  A.actions['theme'] = function () {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    A.setTheme(dark ? 'light' : 'dark');
  };
  A.setTheme = function (t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('nx-theme', t); } catch (e) {}
    var b = document.querySelector('[data-act="theme"]');
    if (b) b.innerHTML = icon(t === 'dark' ? 'sun' : 'moon');
    UI.drawCharts();
  };

  A.actions['user-menu'] = function (el) {
    var name = (A.identity && A.identity.name) || (NX.employee(A.me.emp) || {}).name || 'Signed-in user';
    var items = [
      { header: true, label: name },
      { label: 'Account settings', icon: 'settings', fn: function () { A.go('#/settings/security'); } },
      'sep',
      { label: 'Sign out', icon: 'logout', fn: A.signOut }
    ];
    UI.menu(el, items);
  };

  A.actions['workspace-menu'] = function (el) {
    UI.menu(el, [
      { header: true, label: 'Workspaces' },
      { label: NX.business.name, icon: 'building', checked: true },
      { label: 'Adom Kumasi Branch', icon: 'building', fn: function () { UI.toast('Each workspace keeps its records separate. Switching is done by the server after checking your membership.'); } },
      'sep',
      { label: 'Business profile', icon: 'settings', fn: function () { A.go('#/settings'); } },
      { label: 'Register a new business', icon: 'plus', fn: function () { NXApi.clearToken(); NXApi.stopRealtime(); A.signedIn = false; location.hash = '#/auth/register'; A.render(); } }
    ]);
  };

  A.actions['quick-create'] = function (el) {
    var items = [];
    if (A.can('orders') && A.me.role !== 'finance' && A.me.role !== 'inventory') items.push({ label: 'Order', icon: 'orders', fn: function () { A.actions['new-order'](); } });
    if (A.can('customers')) items.push({ label: 'Customer', icon: 'customers', fn: function () { A.actions['new-customer'](); } });
    if (A.can('sales')) items.push({ label: 'Lead', icon: 'sales', fn: function () { A.actions['new-lead'](); } });
    items.push({ label: 'Task', icon: 'tasks', fn: function () { A.actions['new-task'](); } });
    if (A.can('finance')) items.push({ label: 'Invoice', icon: 'invoice', fn: function () { A.actions['new-invoice'](); } }, { label: 'Expense', icon: 'finance', fn: function () { A.actions['new-expense'](); } });
    if (A.can('inventory')) items.push({ label: 'Product', icon: 'inventory', fn: function () { A.actions['new-product'](); } });
    UI.menu(el, items);
  };

  A.actions['notifications'] = function () {
    var ic = { approval: 'shield', stock: 'inventory', workflow: 'automation', message: 'inbox', integration: 'integrations', task: 'tasks' };
    var html = '<div style="position:fixed;inset:0;z-index:49" data-scrim></div><div class="popover notif-panel" role="dialog" aria-label="Notifications">' +
      '<div class="card-head"><h2>Notifications</h2><button class="btn ghost sm" data-markall>Mark all as read</button></div><div style="overflow-y:auto">' +
      NX.notifications.map(function (n) {
        return '<div class="notif ' + (n.unread ? 'unread' : '') + '" data-go="' + n.go + '" data-id="' + n.id + '" tabindex="0"><span class="n-dot"></span><span style="color:var(--text-2);margin-top:1px">' + icon(ic[n.type], 'i-s') + '</span><div style="flex:1;min-width:0"><div class="n-title">' + UI.esc(n.title) + '</div><div class="small muted">' + UI.esc(n.body) + '</div></div><span class="small faint nowrap">' + n.when + '</span></div>';
      }).join('') +
      '</div><div class="card-foot"><span>Delivered to this device and your desktop app</span><a href="#/settings/notifications" data-close-pop>Preferences</a></div></div>';
    var layer = document.getElementById('overlay');
    layer.innerHTML = html;
    layer.querySelector('[data-scrim]').addEventListener('click', UI.closeAll);
    layer.querySelector('[data-markall]').addEventListener('click', async function () {
      try {
        await NXApi.mutate('POST', '/notifications/read-all', {});
        UI.closeAll(); UI.toast('All notifications marked as read');
      } catch (error) { UI.toast(error.message || 'Could not update notifications'); }
    });
    layer.querySelector('[data-close-pop]').addEventListener('click', UI.closeAll);
    layer.querySelectorAll('.notif').forEach(function (el) {
      var open = async function () {
        var n = NX.byId(NX.notifications, el.getAttribute('data-id'));
        if (!n) return;
        if (n.unread) {
          try { await NXApi.mutate('PATCH', '/notifications/' + n.id, { unread: false }); }
          catch (error) { UI.toast(error.message || 'Could not update notification'); }
        }
        UI.closeAll(); location.hash = n.go; A.render();
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') open(); });
    });
  };

  /* ---------- Command palette ---------- */
  A.actions['palette'] = function () {
    var layer = document.getElementById('overlay');
    layer.innerHTML = '<div class="scrim" data-scrim><div class="modal palette" role="dialog" aria-label="Search"><input type="text" placeholder="Search or jump to a page" aria-label="Search" autocomplete="off"><div class="results" role="listbox"></div><div class="card-foot"><span>Enter to open, arrows to move</span><span>Esc to close</span></div></div></div>';
    var input = layer.querySelector('input'), res = layer.querySelector('.results');
    var sel = 0, items = [];
    var build = function () {
      var q = input.value.trim().toLowerCase();
      items = [];
      A.nav.forEach(function (g) { g.items.forEach(function (it) { if (A.can(it.id) && (!q || it.label.toLowerCase().indexOf(q) > -1)) items.push({ g: 'Go to', label: it.label, icon: it.icon, go: '#/' + it.id }); }); });
      if (q) {
        if (A.can('customers')) NX.customers.forEach(function (c) { if ((c.name + ' ' + c.company + ' ' + c.phone).toLowerCase().indexOf(q) > -1) items.push({ g: 'Customers', label: c.name + (c.company ? ', ' + c.company : ''), icon: 'user', go: '#/customers/c/' + c.id, k: c.city }); });
        if (A.can('orders')) NX.orders.forEach(function (o) { if ((o.id + ' ' + NX.customer(o.customer).name).toLowerCase().indexOf(q) > -1) items.push({ g: 'Orders', label: o.id + ', ' + NX.customer(o.customer).name, icon: 'orders', go: '#/orders/o/' + o.id, k: o.status }); });
        if (A.can('inventory')) NX.products.forEach(function (p) { if ((p.name + ' ' + p.sku).toLowerCase().indexOf(q) > -1) items.push({ g: 'Products', label: p.name, icon: 'inventory', go: '#/inventory/p/' + p.id, k: p.stock + ' in stock' }); });
        if (A.can('finance')) NX.invoices.forEach(function (v) { if ((v.id + ' ' + NX.customer(v.customer).name).toLowerCase().indexOf(q) > -1) items.push({ g: 'Invoices', label: v.id + ', ' + NX.customer(v.customer).name, icon: 'invoice', go: '#/finance', k: v.status }); });
      }
      items = items.slice(0, 14);
      sel = Math.min(sel, Math.max(0, items.length - 1));
      var last = '', html = '';
      items.forEach(function (it, i) {
        if (it.g !== last) { html += '<div class="group">' + it.g + '</div>'; last = it.g; }
        html += '<div class="res" role="option" data-i="' + i + '" aria-selected="' + (i === sel) + '">' + icon(it.icon, 'i-s') + '<span class="ellipsis">' + UI.esc(it.label) + '</span>' + (it.k ? '<span class="k">' + UI.esc(it.k) + '</span>' : '') + '</div>';
      });
      res.innerHTML = html || '<div class="empty small">No results for "' + UI.esc(input.value) + '". Try a customer name, order number or product SKU.</div>';
    };
    var open = function (i) { var it = items[i]; if (!it) return; UI.closeAll(); location.hash = it.go; };
    input.addEventListener('input', function () { sel = 0; build(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); build(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); build(); e.preventDefault(); }
      if (e.key === 'Enter') open(sel);
    });
    res.addEventListener('click', function (e) { var r = e.target.closest('.res'); if (r) open(+r.getAttribute('data-i')); });
    layer.querySelector('[data-scrim]').addEventListener('click', function (e) { if (e.target.hasAttribute('data-scrim')) UI.closeAll(); });
    build();
    input.focus();
  };

  /* ---------- Event wiring ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var fn = A.actions[el.getAttribute('data-act')];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-change]');
    if (!el) return;
    var fn = A.actions[el.getAttribute('data-change')];
    if (fn) fn(el, e);
  });
  var clearErr = function (e) { var f = e.target.closest && e.target.closest('.field.has-err'); if (f) f.classList.remove('has-err'); };
  document.addEventListener('input', clearErr);
  document.addEventListener('change', clearErr);
  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-input]');
    if (!el) return;
    var fn = A.actions[el.getAttribute('data-input')];
    if (fn) fn(el, e);
  });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && A.signedIn) { e.preventDefault(); A.actions.palette(); }
    if (e.key === 'Escape' && document.getElementById('overlay').innerHTML) UI.closeAll();
    if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-act][tabindex]')) { var fn = A.actions[e.target.getAttribute('data-act')]; if (fn) { e.preventDefault(); fn(e.target, e); } }
  });
  window.addEventListener('hashchange', function () { UI.closeAll(); A.render(); var c = document.getElementById('content'); if (c) c.scrollTop = 0; });
  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { UI.drawCharts(); }, 120); });

  window.App = A;

  document.addEventListener('DOMContentLoaded', async function () {
    var t = 'light';
    try { t = localStorage.getItem('nx-theme') || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) {}
    document.documentElement.setAttribute('data-theme', t);
    A.signedIn = false;
    if (!location.hash) location.hash = '#/auth/login';
    A.render();
    if (!NXApi.getToken()) return;
    try {
      var session = await NXApi.restoreSession();
      A.applyIdentity(session.me, session.context, session.permissions);
      NXApi.applyBootstrap(session.bootstrap);
      A.signedIn = true;
      if (/^#\/auth/.test(location.hash)) location.hash = '#/overview';
      A.renderShell(); A.render();
      NXApi.connectRealtime();
    } catch (error) {
      NXApi.clearToken();
      NXApi.stopRealtime();
      A.signedIn = false;
      location.hash = '#/auth/login';
      A.render();
      if (error.status !== 401) UI.toast(error.message || 'Could not restore your session');
    }
  });
})();
