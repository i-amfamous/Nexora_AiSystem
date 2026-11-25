/* Views: automation, AI agents and approvals, analytics, integrations, settings. */
(function () {
  var A = App, esc = UI.esc, money = UI.money;

  /* Defensive helpers for data that arrives from the server at runtime. */
  function nm(row, fallback) { return row && row.name ? row.name : (fallback || 'Unknown'); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function text(value, fallback) { return value === undefined || value === null || value === '' ? (fallback || '') : String(value); }
  function num(value) { var n = Number(value); return isFinite(n) ? n : 0; }
  function pct(value) { return Math.max(0, Math.min(100, num(value))); }
  function total(list, field) { return arr(list).reduce(function (n, row) { return n + num(row && row[field]); }, 0); }
  function channelName(key) {
    var ch = NX.channels && NX.channels[key];
    return ch && ch.name ? ch.name : 'Unknown channel';
  }
  function productLabel(p) { return text(p && p.name).split(' (')[0] || 'Unnamed product'; }
  function levelLabel(level) { return levelNames[displayLevel(level)] || 'Not configured'; }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dateLabels(count) {
    var labels = [], tips = [], today = new Date(), i;
    for (i = 0; i < count; i++) {
      var d = new Date(today.getTime());
      d.setDate(today.getDate() - (count - 1 - i));
      labels.push(d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()]);
      tips.push(d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear());
    }
    return { labels: labels, tips: tips };
  }
  function isAIRequester(row) {
    return /^ai/i.test(text(row && row.requesterType)) || /agent/i.test(text(row && row.requester));
  }
  function whenValue(row) { return text(row && (row.when || row.at || row.createdAt || row.occurredAt), 'Not recorded'); }
  function agentName(row) {
    var id = row && (row.agentId || row.agent || row.requester);
    return nm(NX.byId(NX.agents, id), text(row && (row.agentName || row.agent || row.requester), 'Unknown agent'));
  }
  function approvalTools(ap) {
    var proposed = arr(ap && ap.proposed).map(function (p) { return p && (p.tool || p.type || p.title); }).filter(Boolean);
    return proposed.length ? proposed.join(', ') : text(ap && (ap.action || ap.tools), 'Not recorded');
  }
  function approvalLink(ap) {
    var id = text(ap && (ap.resource || ap.record || ap.conversationId || ap.customerId));
    if (!id) return '';
    if (NX.byId(NX.conversations, id)) return '<a class="btn ghost sm" href="#/inbox/' + esc(id) + '">View conversation</a>';
    if (NX.byId(NX.orders, id)) return '<a class="btn ghost sm" href="#/orders/o/' + esc(id) + '">View order</a>';
    if (typeof NX.customer === 'function' && NX.customer(id)) return '<a class="btn ghost sm" href="#/customers/c/' + esc(id) + '">View customer</a>';
    return '';
  }

  var levelNames = { suggest: 'Suggest only', approve: 'Prepare for approval', execute: 'Execute permitted actions' };
  var levelDesc = { suggest: 'Recommends actions. Never acts on its own.', approve: 'Prepares actions for a person to approve.', execute: 'Carries out low-risk actions within its permissions.' };
  /* The API stores "prepare" for the UI's "approve" level. */
  function displayLevel(level) { return level === 'prepare' ? 'approve' : level; }

  var TRIGGER_KEYS = {
    'New customer created': 'customer.created', 'New message received': 'message.received',
    'New order created': 'order.created', 'Order status changed': 'order.status_changed',
    'Stock threshold reached': 'stock.threshold', 'Invoice created': 'invoice.created',
    'Payment status changed': 'payment.status_changed', 'Task deadline reached': 'task.deadline',
    'Scheduled event: daily 08:00': 'scheduled.daily'
  };
  var CONDITION_KEYS = {
    'Customer category': 'category', 'Order value': 'total', 'Stock quantity': 'quantity',
    'Employee assignment': 'who', 'Invoice status': 'status', 'Message category': 'category',
    'Channel': 'channel', 'Task status': 'status', 'Payment': 'verified'
  };
  var OPERATOR_KEYS = { 'is': 'equals', 'is not': 'notEquals', 'is above': 'greaterThan', 'is below': 'lessThan', 'contains': 'contains' };
  var ACTION_KEYS = {
    'Create a task': 'create_task', 'Create a task for account owner': 'create_task', 'Create a task: credit check': 'create_task',
    'Assign conversation to Sales team': 'assign_conversation', 'Send notification to Business owner': 'notify',
    'Notify department manager': 'notify', 'Update record field': 'notify',
    'Prepare approval request for Department manager': 'notify', 'Send authorised message in original channel': 'notify',
    'Trigger Sales Agent': 'trigger_agent', 'Trigger Inventory Agent: prepare purchase request': 'trigger_agent',
    'Trigger Finance Assistant: prepare reminder': 'trigger_agent', 'Trigger Operations Assistant': 'trigger_agent'
  };
  var TOOL_KEYS = {
    'products.search': 'get_product_availability', 'inventory.check_availability': 'get_product_availability',
    'orders.get': 'get_order', 'customers.get': 'get_customer', 'inventory.list': 'list_low_stock',
    'movements.list': 'list_low_stock', 'invoices.list': 'get_finance_summary', 'payments.list': 'get_finance_summary',
    'expenses.list': 'get_finance_summary', 'tasks.list': 'get_task_summary', 'tasks.create': 'create_task',
    'analytics.query': 'get_analytics', 'purchase_requests.create_draft': 'prepare_purchase_request',
    'reminders.prepare': 'get_finance_summary'
  };
  function agentIdFor(label) {
    if (/Inventory/i.test(label)) return 'inventory';
    if (/Sales/i.test(label)) return 'sales';
    if (/Finance/i.test(label)) return 'finance';
    if (/Operations/i.test(label)) return 'ops';
    return 'support';
  }
  function workflowPayload(d) {
    var conditions = arr(d.conds).filter(function (c) { return c && c[0]; }).map(function (c) {
      return { field: CONDITION_KEYS[c[0]] || String(c[0]).toLowerCase().replace(/\s+/g, '_'), operator: OPERATOR_KEYS[c[1]] || 'equals', value: c[2] };
    });
    var labels = arr(d.actions).filter(Boolean);
    var actions = labels.map(function (label) {
      var type = ACTION_KEYS[label] || 'notify';
      var action = { type: type, title: label, who: (A.me && A.me.emp) || '' };
      if (type === 'trigger_agent') action.agentId = agentIdFor(label);
      if (type === 'create_task') { action.due = 'Today'; action.priority = 'Normal'; }
      if (type === 'notify') { action.body = label; action.go = '#/automation'; }
      return action;
    });
    return {
      name: d.name, label: d.name, trigger: d.trigger, conds: arr(d.conds).filter(function (c) { return c && c[0]; }),
      conditions: conditions, actions: actions, labels: labels, active: d.on !== false, on: d.on !== false,
      approval: !!d.approval, runs: d.runs || 0, ok: d.ok || 0, last: d.last || 'Never'
    };
  }

  var PREF_ROWS = [
    ['New customer messages assigned to me', 'assignment'], ['Approval requests', 'approval'],
    ['Task assigned or overdue', 'assignment'], ['Low-stock alerts', 'stock'],
    ['Order updates', 'inApp'], ['Payment status changes', 'inApp'],
    ['Workflow failures', 'workflowFailure'], ['AI escalations', 'approval'],
    ['Integration problems', 'workflowFailure']
  ];
  var RETENTION_DAYS = { '1 year': 365, '2 years': 730, '3 years': 1095, '7 years': 2555, 'Until deleted': 0 };

  function loadPreferences() {
    if (A.state.prefsLoaded) return;
    A.state.prefsLoaded = true;
    NXApi.request('GET', '/notifications/preferences').then(function (prefs) {
      NXApi.applyBootstrap({ notificationPreferences: prefs });
      if (A.route().page === 'settings' && A.route().sub === 'notifications') A.render();
    }).catch(function (error) {
      A.state.prefsLoaded = false;
      UI.toast((error && error.message) || 'Could not load notification preferences');
    });
  }

  function loadRetention() {
    if (A.state.retentionLoaded) return;
    A.state.retentionLoaded = true;
    NXApi.request('GET', '/data/retention').then(function (policy) {
      NXApi.applyBootstrap({ business: Object.assign({}, NX.business, { retentionPolicy: policy }) });
      if (A.route().page === 'settings' && A.route().sub === 'data') A.render();
    }).catch(function (error) {
      A.state.retentionLoaded = false;
      UI.toast((error && error.message) || 'Could not load retention settings');
    });
  }

  function samplePayload(conds) {
    var payload = {};
    arr(conds).forEach(function (c) {
      if (!c || !c[0]) return;
      var field = CONDITION_KEYS[c[0]] || String(c[0]).toLowerCase().replace(/\s+/g, '_');
      var value = String(c[2] === undefined ? '' : c[2]);
      if (/[\d]/.test(value)) value = value.replace(/[^\d.-]/g, '');
      payload[field] = (c[1] === 'is above' || c[1] === 'is below') ? (Number(value) || 0) : value;
    });
    return payload;
  }

  /* ================= Automation ================= */
  var TRIGGERS = ['New customer created', 'New message received', 'New order created', 'Order status changed', 'Stock threshold reached', 'Invoice created', 'Payment status changed', 'Task deadline reached', 'Scheduled event: daily 08:00'];
  var COND_FIELDS = ['Customer category', 'Order value', 'Stock quantity', 'Employee assignment', 'Invoice status', 'Message category', 'Channel', 'Task status', 'Payment'];
  var OPS = ['is', 'is not', 'is above', 'is below', 'contains'];
  var ACTIONS = ['Create a task', 'Assign conversation to Sales team', 'Send notification to Business owner', 'Notify department manager', 'Update record field', 'Prepare approval request for Department manager', 'Trigger Sales Agent', 'Trigger Inventory Agent: prepare purchase request', 'Trigger Finance Assistant: prepare reminder', 'Trigger Operations Assistant', 'Send authorised message in original channel', 'Create a task for account owner', 'Create a task: credit check'];

  A.views.automation = function (r) {
    if (r.sub === 'w' || r.sub === 'new') return builder(r.sub === 'new' ? null : NX.byId(NX.workflows, r.id));
    var tab = r.sub || '';
    var body;
    if (!tab) {
      body = '<div class="card"><ul class="list">' + (arr(NX.workflows).length ? arr(NX.workflows).map(function (w) {
        var rate = w.runs ? Math.round(w.ok / w.runs * 1000) / 10 : null;
        return '<li style="align-items:flex-start;padding:16px 18px"><label class="switch" style="margin-top:2px"><input type="checkbox" ' + (w.on ? 'checked' : '') + ' data-change="wf-toggle" data-id="' + w.id + '" aria-label="' + (w.on ? 'Deactivate' : 'Activate') + ' ' + esc(nm(w)) + '"><span></span></label>' +
          '<div class="grow"><div class="row" style="gap:8px"><a class="title" href="#/automation/w/' + w.id + '" style="color:var(--text)">' + esc(nm(w)) + '</a>' + (w.approval ? '<span class="badge warn">' + icon('shield', 'i-s') + 'Needs approval</span>' : '') + (!w.on ? '<span class="badge">Off</span>' : '') + '</div>' +
          '<div class="small muted mt-8" style="margin-top:4px"><span class="step-kind when">When</span> ' + esc(w.trigger || '') + '&nbsp; <span class="step-kind if">If</span> ' + arr(w.conds).map(function (c) { return esc(arr(c).join(' ')); }).join(' and ') + '&nbsp; <span class="step-kind then">Then</span> ' + esc(arr(w.actions).join(', then ')) + '</div></div>' +
          '<div style="text-align:right;min-width:150px"><div class="num strong">' + (w.runs || 0) + ' runs</div><div class="small ' + (rate !== null && rate < 95 ? 'down' : 'faint') + '">' + (rate === null ? 'Not run yet' : rate + '% succeeded') + '</div><div class="small faint">Last: ' + esc(w.last || 'Never') + '</div></div></li>';
      }).join('') : UI.empty('No workflows yet', 'Workflows appear here once they are created.')) + '</ul></div>';
    } else {
      body = '<div class="card"><table class="t"><thead><tr><th>When</th><th>Workflow</th><th>Result</th><th>Duration</th><th>Details</th><th></th></tr></thead><tbody>' +
        (arr(NX.executions).length ? arr(NX.executions).map(function (x) { return '<tr><td class="small muted nowrap">' + esc(x.when || '') + '</td><td class="strong">' + esc(nm(NX.byId(NX.workflows, x.wf), x.wf || 'Unknown')) + '</td><td>' + UI.status(x.result) + '</td><td class="num small">' + esc(x.dur || '') + '</td><td class="small">' + esc(x.detail || '') + '</td><td>' + (x.result === 'Failed' ? '<button class="btn sm" data-act="wf-retry" data-id="' + x.id + '">' + icon('refresh', 'i-s') + 'Retry now</button>' : '') + '</td></tr>'; }).join('') : '<tr><td colspan="6">' + UI.empty('No runs yet', 'Workflow executions appear here once a workflow runs.') + '</td></tr>') +
        '</tbody></table></div><p class="small faint mt-12">Failed runs retry automatically up to 3 times. Each event is processed once, even if a provider sends it twice.</p>';
    }
    return '<div class="page">' + A.head('Automation', 'Workflows run in the background when business events happen. Sensitive actions stop for approval.', '<a class="btn primary" href="#/automation/new">' + icon('plus', 'i-s') + 'New workflow</a>') +
      A.tabBar('automation', [['', 'Workflows', arr(NX.workflows).length], ['history', 'Run history']], tab) + body + '</div>';
  };

  function builder(w) {
    var isNew = !w;
    var draft = A.state.wfDraft && A.state.wfDraft.id === (w ? w.id : 'new') ? A.state.wfDraft : (A.state.wfDraft = w ? JSON.parse(JSON.stringify(w)) : { id: 'new', name: '', on: false, trigger: '', conds: [['Order value', 'is above', '']], actions: [''], approval: false, runs: 0, ok: 0, last: 'Never' });
    var sel = function (opts, v, attrs) { return '<select class="input input-sm" ' + attrs + '><option value="">Choose</option>' + opts.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>'; };
    return '<div class="page"><div class="page-head"><div><a href="#/automation" class="small row" style="gap:4px;margin-bottom:6px">' + icon('chevronLeft', 'i-s') + 'Automation</a><h1>' + (isNew ? 'New workflow' : esc(draft.name)) + '</h1></div>' +
      '<div class="actions"><button class="btn" data-act="wf-test">' + icon('play', 'i-s') + 'Test with sample data</button><button class="btn primary" data-act="wf-save">' + (isNew ? 'Create workflow' : 'Save changes') + '</button></div></div>' +
      '<div class="flow" id="wf">' +
        '<div class="field" style="margin-bottom:16px"><label for="wf-name">Workflow name</label><input id="wf-name" class="input" value="' + esc(draft.name) + '" data-input="wf-name" placeholder="For example Large order alert" required><span class="err">Give the workflow a name.</span></div>' +
        '<section class="step"><div class="step-head"><span class="step-kind when">When</span><b>This happens</b></div><div class="step-body"><div class="field">' + sel(TRIGGERS, draft.trigger, 'data-change="wf-trigger" aria-label="Trigger" required') + '<span class="err">Choose what starts this workflow.</span></div></div></section>' +
        '<div class="connector"></div>' +
        '<section class="step"><div class="step-head"><span class="step-kind if">If</span><b>All of these are true</b><span class="faint small" style="margin-left:auto">Optional</span></div><div class="step-body">' +
          arr(draft.conds).map(function (c, i) { return '<div class="cond-row">' + sel(COND_FIELDS, c[0], 'data-change="wf-cond" data-i="' + i + '" data-k="0" aria-label="Condition field"') + sel(OPS, c[1], 'data-change="wf-cond" data-i="' + i + '" data-k="1" aria-label="Operator"') + '<input class="input input-sm" value="' + esc(c[2] || '') + '" data-change="wf-cond" data-i="' + i + '" data-k="2" aria-label="Value" placeholder="Value"><button class="icon-btn" data-act="wf-cond-rm" data-i="' + i + '" aria-label="Remove condition">' + icon('x', 'i-s') + '</button></div>'; }).join('') +
          '<button class="btn ghost sm" style="align-self:flex-start" data-act="wf-cond-add">' + icon('plus', 'i-s') + 'Add condition</button></div></section>' +
        '<div class="connector"></div>' +
        '<section class="step"><div class="step-head"><span class="step-kind then">Then</span><b>Do these in order</b></div><div class="step-body">' +
          arr(draft.actions).map(function (a, i) { return '<div class="row"><span class="faint small num" style="width:18px">' + (i + 1) + '.</span><div class="field" style="flex:1">' + sel(ACTIONS, a, 'data-change="wf-action" data-i="' + i + '" aria-label="Action ' + (i + 1) + '"' + (i === 0 ? ' required' : '')) + '<span class="err">Choose at least one action.</span></div>' + (arr(draft.actions).length > 1 ? '<button class="icon-btn" data-act="wf-action-rm" data-i="' + i + '" aria-label="Remove action">' + icon('x', 'i-s') + '</button>' : '') + '</div>'; }).join('') +
          '<button class="btn ghost sm" style="align-self:flex-start" data-act="wf-action-add">' + icon('plus', 'i-s') + 'Add action</button></div></section>' +
        '<section class="card mt-16"><div class="card-body stack" style="gap:12px">' +
          '<label class="check"><input type="checkbox" ' + (draft.approval ? 'checked' : '') + ' data-change="wf-approval"><span><b style="font-weight:600">Stop for approval before acting</b><br><span class="small muted">Required automatically for refunds, payments, permission changes and deletions.</span></span></label>' +
          '<div class="row small muted" style="gap:8px">' + icon('refresh', 'i-s') + 'Retries failed steps up to 3 times, 5 minutes apart. Duplicate events are ignored.</div>' +
        '</div></section>' +
      '</div></div>';
  }
  var D = function () { return A.state.wfDraft; };
  A.actions['wf-name'] = function (el) { var d = D(); if (d) d.name = el.value; };
  A.actions['wf-trigger'] = function (el) { var d = D(); if (d) d.trigger = el.value; };
  A.actions['wf-cond'] = function (el) { var d = D(); if (!d) return; d.conds = arr(d.conds); var c = d.conds[+el.getAttribute('data-i')]; if (c) c[+el.getAttribute('data-k')] = el.value; };
  A.actions['wf-cond-add'] = function () { var d = D(); if (!d) return; d.conds = arr(d.conds); d.conds.push(['', 'is', '']); A.render(); };
  A.actions['wf-cond-rm'] = function (el) { var d = D(); if (!d) return; d.conds = arr(d.conds); d.conds.splice(+el.getAttribute('data-i'), 1); A.render(); };
  A.actions['wf-action'] = function (el) { var d = D(); if (!d) return; d.actions = arr(d.actions); d.actions[+el.getAttribute('data-i')] = el.value; };
  A.actions['wf-action-add'] = function () { var d = D(); if (!d) return; d.actions = arr(d.actions); d.actions.push(''); A.render(); };
  A.actions['wf-action-rm'] = function (el) { var d = D(); if (!d) return; d.actions = arr(d.actions); d.actions.splice(+el.getAttribute('data-i'), 1); A.render(); };
  A.actions['wf-approval'] = function (el) { var d = D(); if (d) d.approval = el.checked; };
  A.actions['wf-test'] = function () {
    var d = D();
    if (!d) return;
    var payload = workflowPayload(d);
    var workflows = arr(NX.workflows);
    var id = d.id !== 'new' ? d.id : (workflows[0] && workflows[0].id);
    if (!id) { UI.toast('Create a workflow before running a test'); return; }
    return NXActions.run(function () {
      return NXApi.request('POST', '/workflows/' + id + '/dry-run', {
        conditions: payload.conditions, actions: payload.actions, payload: samplePayload(d.conds)
      });
    }, 'Test run complete', 'Could not run test').then(function (result) {
      if (!result) return;
      var checks = result.results || [];
      var failures = checks.filter(function (c) { return !c.passed; }).length;
      UI.modal({ title: 'Test run', foot: '<button class="btn primary" data-close>Done</button>', body: '<p class="muted" style="margin-bottom:12px">Evaluated by the workflow engine against sample data. Nothing was changed and no messages were sent.</p><ul class="timeline">' +
        '<li class="' + (result.matched ? 'good' : 'bad') + '"><div>Trigger: ' + esc(d.trigger || 'none chosen') + '</div><div class="when">' + (result.matched ? 'matched' : 'no match') + '</div></li>' +
        '<li class="' + (failures ? 'bad' : 'good') + '"><div>' + checks.length + ' conditions checked, ' + (failures ? failures + ' not matched' : 'all true') + '</div><div class="when">—</div></li>' +
        arr(result.actions).map(function (a) { return '<li class="' + (d.approval ? '' : 'good') + '"><div>' + esc(a.title || a.type || 'Action') + (d.approval ? ' (would wait for approval)' : ' (would run)') + '</div><div class="when">—</div></li>'; }).join('') + '</ul>' });
    });
  };
  A.actions['wf-save'] = function () {
    var d = D(), root = document.getElementById('wf');
    if (!d || !root) return;
    d.conds = arr(d.conds); d.actions = arr(d.actions);
    root.querySelector('#wf-name').closest('.field').classList.toggle('has-err', !String(d.name || '').trim());
    root.querySelector('[data-change="wf-trigger"]').closest('.field').classList.toggle('has-err', !d.trigger);
    var a0 = root.querySelector('[data-change="wf-action"]'); if (a0) a0.closest('.field').classList.toggle('has-err', !d.actions.filter(Boolean).length);
    if (!String(d.name || '').trim() || !d.trigger || !d.actions.filter(Boolean).length) { var b = root.querySelector('.has-err .input'); if (b) b.focus(); return; }
    d.conds = d.conds.filter(function (c) { return c && c[0]; }); d.actions = d.actions.filter(Boolean);
    var isNew = d.id === 'new';
    var payload = workflowPayload(d);
    delete payload.id;
    return NXActions.run(function () {
      var method = isNew ? 'POST' : 'PATCH';
      var path = isNew ? '/workflows' : '/workflows/' + d.id;
      return NXApi.mutate(method, path, payload).then(function (saved) {
        var workflowId = (saved && saved.id) || d.id;
        var trigger = { workflowId: workflowId, trigger: TRIGGER_KEYS[d.trigger] || d.trigger, label: d.trigger };
        var existing = (NX.workflowTriggers || []).filter(function (t) { return t.workflowId === workflowId; })[0];
        return NXApi.mutate(existing ? 'PATCH' : 'POST', existing ? '/workflow-triggers/' + existing.id : '/workflow-triggers', trigger);
      });
    }, 'Workflow saved', 'Could not save workflow').then(function (saved) {
      if (!saved) return;
      A.state.wfDraft = null;
      location.hash = '#/automation';
    });
  };
  A.actions['wf-toggle'] = function (el) {
    var w = NX.byId(NX.workflows, el.getAttribute('data-id'));
    if (!w) return;
    return NXActions.run(function () {
      return NXApi.mutate('POST', '/workflows/' + w.id + '/toggle', { active: el.checked });
    }, nm(w) + (el.checked ? ' activated' : ' deactivated'), 'Could not update workflow');
  };
  A.actions['wf-retry'] = function (el) {
    var x = NX.byId(NX.executions, el.getAttribute('data-id'));
    if (!x || !x.wf) return;
    return NXActions.run(function () {
      return NXApi.mutate('POST', '/workflows/' + x.wf + '/retry/' + x.id, {});
    }, 'Retry queued', 'Could not retry this run');
  };

  /* ================= AI agents ================= */
  A.views.agents = function (r) {
    if (r.sub === 'a') return agentDetail(NX.byId(NX.agents, r.id));
    var tab = r.sub || '';
    var agents = arr(NX.agents);
    var approvals = arr(NX.approvals);
    var pending = approvals.filter(function (a) { return a && a.status === 'Pending'; });
    var body;
    if (!tab) {
      body = agents.length ? '<div class="grid g-3">' + agents.map(function (a) {
        var level = displayLevel(a.level);
        var usage = pct(a.usage);
        return '<section class="card agent-card"><div class="a-top">' + UI.agentAvatar(text(a.short), 'l') + '<div style="flex:1;min-width:0"><div class="row between"><a href="#/agents/a/' + esc(a.id) + '" style="color:var(--text)"><h2>' + esc(nm(a)) + '</h2></a><label class="switch"><input type="checkbox" ' + (a.on ? 'checked' : '') + ' data-change="agent-toggle" data-id="' + esc(a.id) + '" aria-label="' + (a.on ? 'Turn off ' : 'Turn on ') + esc(nm(a)) + '"' + (A.isAdmin() ? '' : ' disabled') + '><span></span></label></div>' +
          '<p class="a-desc">' + esc(text(a.desc, 'No description recorded.')) + '</p><div class="mt-8"><span class="badge ' + (level === 'execute' ? 'accent' : level === 'approve' ? 'warn' : '') + '">' + esc(levelLabel(a.level)) + '</span></div></div></div>' +
          '<div class="a-stats"><div><b>' + num(a.runs) + '</b><span>Actions</span></div><div><b>' + (num(a.runs) ? text(a.success, '0') + '%' : 'None') + '</b><span>Succeeded</span></div><div><b>' + num(a.escal) + '</b><span>Escalated</span></div></div>' +
          '<div class="card-foot"><span class="row" style="gap:8px;flex:1">Usage <span class="meter" style="flex:1;max-width:120px"><i style="width:' + usage + '%"></i></span>' + usage + '% of limit</span><a href="#/agents/a/' + esc(a.id) + '">Configure</a></div></section>';
      }).join('') + '</div>' +
      '<div class="callout mt-16">' + icon('lock') + '<div>Agents are predefined. Each one has its own permission list and never inherits the permissions of the person who turned it on. Agents read data through the same server rules as employees, and every action is logged.</div></div>' : '<div class="card">' + UI.empty('No agents configured', 'Agent records appear here once they are set up.') + '</div>';
    } else if (tab === 'approvals') {
      var list = approvals.slice().sort(function (a, b) { return (a && a.status === 'Pending' ? 0 : 1) - (b && b.status === 'Pending' ? 0 : 1); });
      body = '<div class="card">' + (list.length ? list.map(function (ap) {
        var isAI = isAIRequester(ap);
        var reviewer = text(ap.reviewer || ap.reviewedBy);
        var reviewerName = reviewer && typeof NX.employee === 'function' ? nm(NX.employee(reviewer), reviewer) : text(ap.reviewer, reviewer);
        var risk = text(ap.risk);
        return '<article class="approval"><div class="row" style="gap:10px;align-items:flex-start"><span style="color:' + (isAI ? 'var(--ai)' : 'var(--text-2)') + ';margin-top:2px">' + icon(isAI ? 'sparkle' : 'user') + '</span><div style="flex:1;min-width:0"><div class="row wrap" style="gap:8px"><h3 style="font-size:14.5px">' + esc(text(ap.op || ap.action || ap.type, 'Requested action')) + '</h3>' + UI.status(text(ap.status, 'Not recorded')) + (risk ? '<span class="badge ' + (risk === 'High' ? 'bad' : risk === 'Medium' ? 'warn' : '') + '">' + esc(risk) + ' risk</span>' : '<span class="badge">Risk not stated</span>') + '</div>' +
          '<dl class="ap-grid"><dt>Requested by</dt><dd>' + (isAI ? '<span class="badge ai">' + esc(text(ap.requester, 'AI agent')) + '</span>' : esc(text(ap.requester, 'Unknown'))) + ', ' + esc(whenValue(ap)) + '</dd><dt>Affected record</dt><dd>' + esc(text(ap.record || ap.resource || ap.conversationId || ap.customerId, 'Not recorded')) + '</dd><dt>Reason</dt><dd>' + esc(text(ap.reason, 'No reason recorded.')) + '</dd>' +
          (reviewer ? '<dt>Reviewed by</dt><dd>' + esc(reviewerName) + ', ' + esc(text(ap.decided || ap.decidedAt, 'Not recorded')) + '</dd><dt>Result</dt><dd>' + esc(text(ap.result || ap.decision, 'Not recorded')) + (ap.note ? '. ' + esc(ap.note) : '') + '</dd>' : '') + '<dt>Reference</dt><dd class="faint">' + esc(text(ap.id, 'Not recorded')) + '</dd></dl>' +
          (ap.status === 'Pending' ? '<div class="row"><button class="btn primary sm" data-act="approve" data-id="' + esc(ap.id) + '">' + icon('check', 'i-s') + 'Approve</button><button class="btn sm" data-act="reject" data-id="' + esc(ap.id) + '">Reject</button>' + approvalLink(ap) + '</div>' : '') +
          '</div></div></article>';
      }).join('') : UI.empty('No approval requests', 'Actions that need a person will appear here.')) + '</div>';
    } else {
      var history = arr(NX.agentExecutions);
      if (!history.length) history = approvals.filter(isAIRequester);
      body = '<div class="card"><table class="t"><thead><tr><th>When</th><th>Agent</th><th>What it did</th><th>Tools used</th><th>Record</th><th>Result</th></tr></thead><tbody>' +
        (history.length ? history.map(function (x) {
          var result = text(x.result || x.status, 'Not recorded');
          return '<tr><td class="small muted nowrap">' + esc(whenValue(x)) + '</td><td><span class="badge ai">' + esc(agentName(x)) + '</span></td><td>' + esc(text(x.action || x.op || x.reason, 'Recorded agent activity')) + '</td><td class="small"><code style="font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--text-2)">' + esc(approvalTools(x)) + '</code></td><td class="small">' + esc(text(x.record || x.resource || x.customerId || x.conversationId, 'Not recorded')) + '</td><td>' + (result === 'Escalated' ? '<span class="badge warn">Escalated</span>' : UI.status(result)) + '</td></tr>';
        }).join('') : '<tr><td colspan="6">' + UI.empty('No agent activity yet', 'Actions taken by agents appear here once they run.') + '</td></tr>') +
        '</tbody></table></div>';
    }
    return '<div class="page">' + A.head('AI agents', agents.filter(function (a) { return a && a.on; }).length + ' of ' + agents.length + ' agents on. ' + pending.length + ' actions waiting for approval.', '') +
      A.tabBar('agents', [['', 'Agents', agents.length], ['approvals', 'Approvals', pending.length], ['history', 'Execution history']], tab) + body + '</div>';
  };

  function agentDetail(a) {
    if (!a) return '<div class="page">' + UI.empty('Agent not found', 'It may have been removed.', '<a class="btn" href="#/agents">All agents</a>') + '</div>';
    var ed = A.isAdmin();
    var tools = arr(a.tools), locked = arr(a.locked), duties = arr(a.duties);
    var policy = text(a.policy || a.communicationPolicy);
    var usage = pct(a.usage);
    var hasLimit = a.dailyLimit !== undefined && a.dailyLimit !== null;
    var limitAction = text(a.limitAction, 'Not configured');
    var recent = arr(NX.agentExecutions).filter(function (x) { return x && (text(x.agentId) === text(a.id) || agentName(x) === nm(a)); });
    if (!recent.length) recent = arr(NX.approvals).filter(function (ap) { return isAIRequester(ap) && text(ap.requester).toLowerCase() === text(a.id).toLowerCase(); });
    return '<div class="page"><div class="page-head"><div><a href="#/agents" class="small row" style="gap:4px;margin-bottom:6px">' + icon('chevronLeft', 'i-s') + 'AI agents</a><div class="row" style="gap:12px">' + UI.agentAvatar(text(a.short), 'l') + '<div><h1>' + esc(nm(a)) + '</h1><p class="muted">' + esc(text(a.desc, 'No description recorded.')) + '</p></div></div></div>' +
      '<div class="actions"><span class="small muted">' + (a.on ? 'On' : 'Off') + '</span><label class="switch"><input type="checkbox" ' + (a.on ? 'checked' : '') + ' data-change="agent-toggle" data-id="' + esc(a.id) + '" aria-label="Agent on or off"' + (ed ? '' : ' disabled') + '><span></span></label></div></div>' +
      '<div class="grid g-main"><div class="stack">' +
        '<section class="card"><div class="card-head"><div><h2>How much it can do on its own</h2><div class="sub">You can lower this at any time. High-risk actions always need a person.</div></div></div><div class="card-body"><div class="levels" role="group" aria-label="Automation level">' +
          ['suggest', 'approve', 'execute'].map(function (l) { return '<button class="level" data-act="agent-level" data-id="' + esc(a.id) + '" data-v="' + l + '" aria-pressed="' + (displayLevel(a.level) === l) + '"' + (ed ? '' : ' disabled') + '><b>' + levelNames[l] + '</b><span>' + levelDesc[l] + '</span></button>'; }).join('') + '</div></div></section>' +
        '<section class="card"><div class="card-head"><div><h2>Permitted tools</h2><div class="sub">The only ways this agent can read or change business data</div></div></div><div class="card-body" style="padding-top:4px;padding-bottom:4px">' +
          (tools.length ? tools.map(function (t, i) {
            t = arr(t);
            var key = text(t[0]);
            var tool = TOOL_KEYS[key] || '';
            var label = text(t[1], key || 'Unnamed tool');
            var control = tool ? '<label class="switch"><input type="checkbox" ' + (t[2] ? 'checked' : '') + ' data-change="agent-tool" data-id="' + esc(a.id) + '" data-i="' + i + '" data-tool="' + esc(tool) + '" aria-label="' + esc(label) + '"' + (ed ? '' : ' disabled') + '><span></span></label>' : '<span class="badge" title="No writable permission exists for this legacy tool">Not writable</span>';
            return '<div class="perm"><div class="grow"><div>' + esc(label) + '</div><code>' + esc(key) + '</code></div>' + control + '</div>';
          }).join('') : '<div class="small faint" style="padding:8px 0">No tool permissions recorded.</div>') +
          locked.map(function (t) { return '<div class="perm"><div class="grow"><div>' + esc(t) + '</div><span class="small faint">Always needs human approval or provider verification</span></div><span class="badge">' + icon('lock', 'i-s') + 'Locked</span></div>'; }).join('') +
        '</div></section>' +
        '<section class="card"><div class="card-head"><div><h2>Communication policy</h2><div class="sub">Applied to every reply this agent writes</div></div></div><div class="card-body">' +
          '<textarea class="input" aria-label="Communication policy" placeholder="No policy has been recorded for this agent."' + (ed ? '' : ' readonly') + '>' + esc(policy) + '</textarea>' +
          '<div class="callout mt-12">' + icon('shield') + '<div>Instructions inside customer messages or attachments are treated as content, never as commands. They cannot change this policy or the agent\'s permissions.</div></div></div></section>' +
      '</div><div class="stack">' +
        '<section class="card"><div class="card-head"><h2>Responsibilities</h2></div><ul class="list">' + (duties.length ? duties.map(function (d) { return '<li class="small">' + icon('check', 'i-s faint') + esc(d) + '</li>'; }).join('') : '<li class="small faint">No responsibilities recorded.</li>') + '</ul></section>' +
        '<section class="card"><div class="card-head"><h2>Usage limits</h2></div><div class="card-body stack" style="gap:14px">' +
          '<div><div class="row between small"><span>This month</span><span class="num">' + usage + '% used</span></div><div class="meter mt-8 ' + (usage > 80 ? 'bad' : '') + '"><i style="width:' + usage + '%"></i></div></div>' +
          UI.field({ label: 'Maximum actions per day', type: 'number', value: hasLimit ? a.dailyLimit : '', min: 0, required: hasLimit }) +
          UI.field({ label: 'When the limit is reached', type: 'select', options: limitAction === 'Not configured' ? ['Not configured'] : [limitAction, 'Not configured'], value: limitAction, required: limitAction !== 'Not configured' }) +
        '</div></section>' +
        '<section class="card"><div class="card-head"><h2>Recent activity</h2><a class="small" href="#/agents/history">View all</a></div><div class="card-body"><ul class="timeline">' +
          (recent.length ? recent.slice(0, 3).map(function (x) { return '<li class="' + (isAIRequester(x) ? 'ai' : 'good') + '"><div>' + esc(text(x.action || x.op || x.reason, 'Recorded activity')) + '</div><div class="when">' + esc(whenValue(x)) + '</div></li>'; }).join('') : '<li><div class="muted">No recent activity recorded.</div><div class="when">—</div></li>') + '</ul></div></section>' +
      '</div></div></div>';
  }
  A.actions['agent-toggle'] = function (el) {
    var a = NX.byId(NX.agents, el.getAttribute('data-id'));
    if (!a) return;
    return NXActions.run(function () {
      return NXApi.mutate('PATCH', '/agents/' + a.id, { enabled: el.checked, on: el.checked });
    }, nm(a) + (el.checked ? ' turned on' : ' turned off. Its conversations move to people.'), 'Could not update agent');
  };
  A.actions['agent-level'] = function (el) {
    var a = NX.byId(NX.agents, el.getAttribute('data-id'));
    if (!a) return;
    var level = el.getAttribute('data-v');
    return NXActions.run(function () {
      return NXApi.mutate('POST', '/agents/' + a.id + '/configure', { automationLevel: level === 'approve' ? 'prepare' : level });
    }, nm(a) + ' set to ' + text(levelNames[level], level).toLowerCase(), 'Could not update automation level');
  };
  A.actions['agent-tool'] = function (el) {
    var tool = el.getAttribute('data-tool');
    if (!tool) return;
    return NXActions.run(function () {
      return NXApi.mutate('PUT', '/agents/' + el.getAttribute('data-id') + '/tools/' + tool, { enabled: el.checked });
    }, 'Tool permission updated and recorded in the audit log', 'Could not update tool permission');
  };
  function decide(ap, ok, note) {
    return NXActions.run(function () {
      return NXApi.mutate('POST', '/approvals/' + ap.id + '/decide', { decision: ok ? 'approve' : 'reject', note: note || '' });
    }, ok ? 'Approval recorded' : 'Request rejected', 'Could not record decision');
  }
  A.actions.approve = function (el) {
    var ap = NX.byId(NX.approvals, el.getAttribute('data-id'));
    if (!ap) return;
    if (ap.risk === 'High') {
      UI.modal({ title: 'Approve ' + text(ap.kind || ap.type, 'request').toLowerCase() + '?', body: '<p>' + esc(text(ap.op || ap.action || ap.type, 'Requested action')) + '.</p><p class="muted mt-12">This will be queued for execution and recorded against your name.</p>', foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Approve and execute</button>',
        onOk: function () { return decide(ap, true); } });
    } else { return decide(ap, true); }
  };
  A.actions.reject = function (el) {
    var ap = NX.byId(NX.approvals, el.getAttribute('data-id'));
    if (!ap) return;
    UI.modal({ title: 'Reject request', ok: 'Reject', body: '<p class="muted" style="margin-bottom:12px">' + esc(text(ap.op || ap.action || ap.type, 'Requested action')) + '</p>' + UI.field({ label: 'Reason', type: 'textarea', required: true, name: 'note', err: 'Tell the requester why, so they know what to do next.' }),
      foot: '<button class="btn" data-close>Cancel</button><button class="btn danger solid" data-ok>Reject</button>',
      onOk: function (m) { if (!UI.validate(m)) return false; return decide(ap, false, A.readForm(m).note); } });
  };

  /* ================= Analytics ================= */
  A.views.analytics = function (r) {
    var tab = r.sub || '';
    var range = A.state.anRange || '30d';
    var mult = range === '7d' ? 7 : range === '30d' ? 30 : range === 'q' ? 90 : 365;
    var sales = arr(NX.sales30), prevSales = arr(NX.sales30prev);
    var salesSeries = sales.slice(-Math.min(sales.length, mult));
    var prevSeries = prevSales.slice(-Math.min(prevSales.length, salesSeries.length || mult));
    var convVolume = arr(NX.convVolume), aiHandled = arr(NX.aiHandled);
    var convSeries = convVolume.slice(-Math.min(convVolume.length, mult));
    var aiSeries = aiHandled.slice(-Math.min(aiHandled.length, convSeries.length || mult));
    var orders = arr(NX.orders), invoices = arr(NX.invoices), products = arr(NX.products), customers = arr(NX.customers);
    var conversations = arr(NX.conversations), tasks = arr(NX.tasks), workflows = arr(NX.workflows), agents = arr(NX.agents);
    var executions = arr(NX.executions), approvals = arr(NX.approvals), payments = arr(NX.payments);
    var salesTotal = salesSeries.reduce(function (a, b) { return a + num(b); }, 0);
    var prevTotal = prevSeries.reduce(function (a, b) { return a + num(b); }, 0);
    var salesDays = dateLabels(salesSeries.length), convDays = dateLabels(convSeries.length);
    var body;
    var summary = function (message, sources) {
      var sourceRows = sources.length ? sources : ['No records available yet'];
      return '<section class="card" style="margin-bottom:16px"><div class="card-body"><div class="row" style="gap:8px;margin-bottom:8px">' + icon('sparkle', 'i-s') + '<b style="font-weight:600">Summary by Business Analyst</b><span class="badge">Generated ' + esc(new Date().toLocaleDateString()) + '</span></div><p style="max-width:80ch">' + esc(message) + '</p>' +
        '<div class="row wrap mt-12" style="gap:6px"><span class="small faint">Based on</span>' + sourceRows.map(function (s) { return '<span class="tag">' + icon('layers', 'i-s') + '&nbsp;' + esc(s) + '</span>'; }).join('') + '</div></div></section>';
    };
    if (!tab) {
      var overdue = invoices.filter(function (inv) { return inv && inv.status === 'Overdue'; });
      var overdueAmount = overdue.reduce(function (n, inv) { return n + num(inv.outstanding !== undefined ? inv.outstanding : (inv.total || inv.amt)); }, 0);
      var lowStock = products.filter(function (p) { return p && p.threshold !== undefined && num(p.stock) <= num(p.threshold); });
      var parts = [];
      if (salesSeries.length) parts.push('Recorded sales for the selected period total ' + money(salesTotal, { dp: 0 }) + (prevTotal ? ', compared with ' + money(prevTotal, { dp: 0 }) + ' previously.' : '.'));
      else parts.push('No sales series has been recorded yet.');
      parts.push(orders.length + ' orders and ' + invoices.length + ' invoices are in this workspace.');
      if (overdue.length) parts.push(money(overdueAmount, { dp: 0 }) + ' is outstanding on ' + overdue.length + ' overdue invoice' + (overdue.length === 1 ? '' : 's') + '.');
      if (lowStock.length) parts.push(lowStock.slice(0, 3).map(productLabel).join(', ') + (lowStock.length > 3 ? ' and ' + (lowStock.length - 3) + ' more' : '') + ' are at or below their reorder threshold.');
      else parts.push('No products are currently flagged below their reorder threshold.');
      var salesLegend = [{ name: 'This period', color: 'var(--series-1)', line: true }];
      var salesSpecSeries = [{ name: 'This period', values: salesSeries.map(num), color: 'var(--series-1)' }];
      if (salesSeries.length && prevSeries.length === salesSeries.length) {
        salesLegend.push({ name: 'Previous', color: 'var(--text-3)', line: true, dashed: true });
        salesSpecSeries.push({ name: 'Previous', values: prevSeries.map(num), color: 'var(--text-3)', dashed: true });
      }
      var channelRows = arr(NX.salesByChannel).map(function (x) { return [text(x && x[0], 'Unknown channel'), num(x && x[1])]; });
      var topRows = products.slice().sort(function (a, b) { return num(b && b.sold30) - num(a && a.sold30); }).slice(0, 5).map(function (p) { return [productLabel(p), num(p && p.sold30)]; });
      var cutoff = new Date(Date.now() - mult * 86400000);
      var newCustomers = customers.filter(function (c) { var d = c && c.created ? new Date(c.created) : null; return d && !isNaN(d.getTime()) && d >= cutoff; });
      var orderCounts = {};
      orders.forEach(function (o) { var id = text(o && o.customer); if (id) orderCounts[id] = (orderCounts[id] || 0) + 1; });
      var repeatCustomers = Object.keys(orderCounts).filter(function (k) { return orderCounts[k] > 1; }).length;
      var orderValues = orders.map(function (o) { return typeof NX.orderTotal === 'function' ? num(NX.orderTotal(o)) : 0; });
      var averageOrder = orderValues.length ? orderValues.reduce(function (a, b) { return a + b; }, 0) / orderValues.length : 0;
      var wholesale = customers.filter(function (c) { return /wholesale/i.test(text(c && (c.cat || c.category))); }).length;
      var wholesaleShare = customers.length ? Math.round(wholesale / customers.length * 100) + '%' : '—';
      var workflowRuns = total(workflows, 'runs') || executions.length;
      var succeeded = total(workflows, 'ok');
      var successRate = workflowRuns ? Math.round(succeeded / workflowRuns * 1000) / 10 + '%' : '—';
      var aiActions = total(agents, 'runs') || arr(NX.agentExecutions).length;
      var escalated = total(agents, 'escal') || approvals.filter(isAIRequester).length;
      body = summary(parts.join(' '), [orders.length + ' orders', invoices.length + ' invoices', products.length + ' products', payments.length + ' payment records']) +
        '<div class="grid g-2"><section class="card"><div class="card-head flat"><div><h2>Daily sales</h2><div class="sub">Order value, GHS · ' + salesSeries.length + ' days</div></div>' + UI.legend(salesLegend) + '</div><div class="card-body">' +
          (salesSeries.length ? UI.chart('an-sales', { type: 'line', height: 240, labels: salesDays.labels, tipLabels: salesDays.tips, series: salesSpecSeries, tipFmt: function (v) { return money(v, { dp: 0 }); } }) : UI.empty('No sales data yet', 'Recorded daily sales appear here once orders are added.')) + '</div></section>' +
        '<section class="card"><div class="card-head"><div><h2>Sales by channel</h2><div class="sub">GHS</div></div></div><div class="card-body">' + (channelRows.length ? UI.hbars(channelRows, function (v) { return money(v, { dp: 0 }); }) : UI.empty('No channel data yet', 'Channel totals appear here once sales are recorded.')) + '</div></section></div>' +
        '<div class="grid g-3 mt-16">' +
          '<section class="card"><div class="card-head"><h2>Top products</h2><span class="sub">Units sold</span></div><div class="card-body">' + (topRows.length ? UI.hbars(topRows) : UI.empty('No product data yet', 'Product sales appear here once products are recorded.')) + '</div></section>' +
          '<section class="card"><div class="card-head"><h2>Customers</h2><span class="sub">Recorded in this workspace</span></div><div class="card-body"><dl class="kv" style="grid-template-columns:1fr auto;row-gap:10px"><dt>New customers</dt><dd class="num strong">' + newCustomers.length + '</dd><dt>Repeat buyers</dt><dd class="num strong">' + repeatCustomers + '</dd><dt>Average order</dt><dd class="num strong">' + money(averageOrder, { dp: 0 }) + '</dd><dt>Wholesale share</dt><dd class="num strong">' + wholesaleShare + '</dd></dl></div></section>' +
          '<section class="card"><div class="card-head"><h2>Workflows and AI</h2><span class="sub">Recorded activity</span></div><div class="card-body"><dl class="kv" style="grid-template-columns:1fr auto;row-gap:10px"><dt>Workflow runs</dt><dd class="num strong">' + workflowRuns + '</dd><dt>Succeeded</dt><dd class="num strong">' + successRate + '</dd><dt>AI actions</dt><dd class="num strong">' + aiActions + '</dd><dt>Escalated to people</dt><dd class="num strong">' + escalated + '</dd></dl></div></section>' +
        '</div>';
    } else if (tab === 'communication') {
      var convTotal = convSeries.reduce(function (a, b) { return a + num(b); }, 0);
      var aiTotal = aiSeries.reduce(function (a, b) { return a + num(b); }, 0);
      var aiShare = convTotal ? Math.round(aiTotal / convTotal * 100) + '%' : '—';
      var escalationCount = approvals.filter(isAIRequester).length;
      var channelKeys = Object.keys(NX.channels || {});
      conversations.forEach(function (c) { var key = text(c && (c.channel || c.ch)); if (key && channelKeys.indexOf(key) < 0) channelKeys.push(key); });
      var convLegend = [{ name: 'All conversations', color: 'var(--series-1)' }];
      var convSpecSeries = [{ name: 'All conversations', values: convSeries.map(num), color: 'var(--series-1)' }];
      if (convSeries.length && aiSeries.length === convSeries.length) {
        convLegend.push({ name: 'Handled by AI', color: 'var(--series-2)' });
        convSpecSeries.push({ name: 'Handled by AI', values: aiSeries.map(num), color: 'var(--series-2)' });
      }
      var channelTable = channelKeys.map(function (key) {
        var rowsForChannel = conversations.filter(function (c) { return text(c && (c.channel || c.ch)) === key; });
        var responded = rowsForChannel.filter(function (c) { return c && c.firstResponse; })[0];
        var resolved = rowsForChannel.filter(function (c) { return /resolved|closed/i.test(text(c && c.status)); }).length;
        var aiCount = rowsForChannel.filter(function (c) { return /agent|^ai/i.test(text(c && c.handler)); }).length;
        return [channelName(key), rowsForChannel.length, responded ? text(responded.firstResponse) : '—', rowsForChannel.length ? Math.round(resolved / rowsForChannel.length * 100) + '%' : '—', rowsForChannel.length ? Math.round(aiCount / rowsForChannel.length * 100) + '%' : '—'];
      });
      body = summary(convSeries.length ? 'Customers wrote ' + convTotal + ' times in the selected period. AI handled ' + aiTotal + ' of them (' + aiShare + ').' + (escalationCount ? ' ' + escalationCount + ' actions are waiting for human approval.' : '') : 'No conversation volume has been recorded yet.', [convTotal + ' conversations', channelKeys.length + ' channels', escalationCount + ' escalations']) +
        '<section class="card"><div class="card-head flat"><div><h2>Conversations per day</h2><div class="sub">' + convSeries.length + ' days</div></div>' + UI.legend(convLegend) + '</div><div class="card-body">' +
          (convSeries.length ? UI.chart('an-conv', { type: 'bar', height: 240, labels: convDays.labels, tipLabels: convDays.tips, series: convSpecSeries }) : UI.empty('No conversation data yet', 'Daily conversation volume appears here once messages are recorded.')) + '</div></section>' +
        '<section class="card mt-16"><table class="t"><thead><tr><th>Channel</th><th class="num">Conversations</th><th class="num">First response</th><th class="num">Resolved</th><th class="num">AI share</th></tr></thead><tbody>' +
          (channelTable.length ? channelTable.map(function (x) { return '<tr><td>' + esc(x[0]) + '</td><td class="num">' + x[1] + '</td><td class="num">' + esc(x[2]) + '</td><td class="num">' + esc(x[3]) + '</td><td class="num">' + esc(x[4]) + '</td></tr>'; }).join('') : '<tr><td colspan="5">' + UI.empty('No channels recorded', 'Channel activity appears here once channels are configured.') + '</td></tr>') +
        '</tbody></table></section>';
    } else {
      var active = arr(NX.employees).filter(function (e) { return e && e.status === 'active'; });
      var taskRows = arr(NX.tasks), orderRows = arr(NX.orders);
      body = '<section class="card"><table class="t"><thead><tr><th>Employee</th><th>Department</th><th class="num">Tasks done</th><th class="num">Open</th><th class="num">Conversations</th><th class="num">Orders</th></tr></thead><tbody>' +
        (active.length ? active.map(function (e) {
          var dept = typeof NX.dept === 'function' ? NX.dept(e.dept) : null;
          var done = taskRows.filter(function (t) { return t && t.by === e.id && /done|complete/i.test(text(t.status)); }).length;
          var open = taskRows.filter(function (t) { return t && t.by === e.id && !/done|complete/i.test(text(t.status)); }).length;
          var handled = conversations.filter(function (c) { return c && (c.by === e.id || c.assignee === e.id || c.owner === e.id); }).length;
          return '<tr><td><div class="cell-2">' + UI.avatar(nm(e), 's') + esc(nm(e)) + '</div></td><td class="muted">' + esc(nm(dept, 'No department')) + '</td><td class="num">' + done + '</td><td class="num">' + open + '</td><td class="num">' + handled + '</td><td class="num">' + orderRows.filter(function (o) { return o && o.by === e.id; }).length + '</td></tr>';
        }).join('') : '<tr><td colspan="6">' + UI.empty('No active employees', 'Team figures appear here once people are added.') + '</td></tr>') +
        '</tbody></table></section><p class="small faint mt-12">Figures count work recorded in Nexora. They are a starting point for conversations, not a ranking.</p>';
    }
    return '<div class="page">' + A.head('Analytics', 'Calculated from records in this workspace that your role can see.', '<div class="seg" role="group" aria-label="Date range">' + [['7d', '7 days'], ['30d', '30 days'], ['q', 'Quarter'], ['y', 'Year']].map(function (o) { return '<button data-act="an-range" data-v="' + o[0] + '" aria-pressed="' + (range === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div><button class="btn" data-act="export">' + icon('download', 'i-s') + 'Export</button>') +
      A.tabBar('analytics', [['', 'Business'], ['communication', 'Communication'], ['people', 'Team']], tab) + body + '</div>';
  };
  A.actions['an-range'] = function (el) { A.state.anRange = el.getAttribute('data-v'); A.render(); };

  /* ================= Integrations ================= */
  A.views.integrations = function () {
    var integrations = arr(NX.integrations), cats = [];
    integrations.forEach(function (i) { var c = text(i && i.cat, 'Other'); if (cats.indexOf(c) === -1) cats.push(c); });
    return '<div class="page">' + A.head('Integrations', 'Connect the services your business already uses. Nexora works on its own; these extend it.', '') +
      (integrations.length ? cats.map(function (c) {
        return '<h2 style="margin:24px 0 10px">' + esc(c) + '</h2><div class="card"><ul class="list">' + integrations.filter(function (i) { return text(i && i.cat, 'Other') === c; }).map(function (i) {
          var ch = NX.channels && NX.channels[i.id];
          var name = text(i.name, 'Unnamed integration');
          var status = text(i.status, 'off');
          var logo = ch ? '<span class="chan-ico" style="width:32px;height:32px;border-radius:8px;font-size:13px;background:' + esc(ch.color) + '">' + esc(ch.short) + '</span>' : '<span class="ws-logo" style="width:32px;height:32px">' + esc(name.slice(0, 2).toUpperCase()) + '</span>';
          return '<li>' + logo + '<div class="grow"><div class="title">' + esc(name) + '</div><div class="meta">' + esc(text(i.detail, 'No connection details recorded.')) + (i.sync ? ', last sync ' + esc(i.sync) : '') + '</div></div>' + UI.status(status) +
            (status === 'connected' ? '<button class="btn sm" data-act="int-off" data-id="' + esc(i.id) + '">Disconnect</button>' : status === 'error' ? '<button class="btn primary sm" data-act="int-on" data-id="' + esc(i.id) + '">Reconnect</button>' : '<button class="btn sm" data-act="int-on" data-id="' + esc(i.id) + '">Connect</button>') + '</li>';
        }).join('') + '</ul></div>';
      }).join('') : '<div class="card">' + UI.empty('No integrations available', 'Integration records appear here once they are configured.') + '</div>') +
      '<div class="callout mt-24">' + icon('key') + '<div>Credentials are encrypted and never shown again after you connect. Connected services rely on their own provider approvals. A problem with one service does not affect the others.</div></div></div>';
  };
  A.actions['int-on'] = function (el) {
    var i = NX.byId(NX.integrations, el.getAttribute('data-id'));
    if (!i) return;
    var name = text(i.name, 'integration');
    var firstWord = name.split(' ')[0] || 'provider';
    UI.modal({ title: (text(i.status) === 'error' ? 'Reconnect ' : 'Connect ') + name, ok: 'Continue to ' + firstWord,
      body: '<p class="muted">You will sign in to ' + esc(name.split(' (')[0] || name) + ' in a new window and choose what Nexora may access. Nexora will be able to:</p><ul class="mt-12" style="padding-left:18px;line-height:1.9">' + (text(i.cat) === 'Communication' ? '<li>Receive messages sent to your business account</li><li>Send replies written by your team or approved agents</li><li>Read delivery and read status</li>' : text(i.cat) === 'Payments' ? '<li>Receive payment confirmations to verify invoices</li><li>Create payment links on invoices</li>' : '<li>Read and write the records you choose to sync</li>') + '</ul>',
      onOk: function () {
        return NXActions.run(function () { return NXApi.mutate('POST', '/integrations/' + text(i.id) + '/connect', {}); }, name + ' connected', 'Could not connect ' + name);
      } });
  };
  A.actions['int-off'] = function (el) {
    var i = NX.byId(NX.integrations, el.getAttribute('data-id'));
    if (!i) return;
    var name = text(i.name, 'integration');
    UI.modal({ title: 'Disconnect ' + name + '?', body: '<p>' + (text(i.cat) === 'Communication' ? 'New messages from this channel will stop arriving in the inbox. Past conversations stay.' : 'Syncing will stop. Records already in Nexora stay.') + '</p>',
      foot: '<button class="btn" data-close>Keep connected</button><button class="btn danger solid" data-ok>Disconnect</button>', onOk: function () {
        return NXActions.run(function () { return NXApi.mutate('POST', '/integrations/' + text(i.id) + '/disconnect', {}); }, name + ' disconnected', 'Could not disconnect ' + name);
      } });
  };

  /* ================= Settings ================= */
  A.views.settings = function (r) {
    var tab = r.sub || '';
    var admin = A.isAdmin();
    var tabs = [['', 'Business profile'], ['notifications', 'Notifications'], ['security', 'Sign-in and devices'], ['apps', 'Desktop apps']];
    if (admin) tabs.push(['audit', 'Audit log'], ['data', 'Data and privacy']);
    tabs.push(['appearance', 'Appearance']);
    var b = NX.business || {}, body;
    if (tab === 'notifications') loadPreferences();
    if (tab === 'data') loadRetention();
    if (!tab) {
      body = '<section class="card" style="max-width:820px"><div class="card-body"><div class="form-grid" id="biz">' +
        UI.field({ label: 'Business name', required: true, value: text(b.name), name: 'name' }) + UI.field({ label: 'Workspace ID', value: text(b.id), readonly: true, hint: 'Share this with Nexora support if you need help.' }) +
        UI.field({ label: 'Email', type: 'email', required: true, value: text(b.email), name: 'email' }) + UI.field({ label: 'Phone', required: true, value: text(b.phone), name: 'phone' }) +
        UI.field({ label: 'Address', required: true, value: text(b.address), name: 'address', span: true }) +
        UI.field({ label: 'Currency', type: 'select', options: [['GHS', 'Ghana cedi (GHS)'], ['USD', 'US dollar (USD)']], value: text(b.currency, 'GHS'), required: true, name: 'currency' }) +
        UI.field({ label: 'Time zone', type: 'select', options: ['Africa/Accra (GMT+0)', 'Africa/Lagos (GMT+1)'], value: text(b.timezone, 'Africa/Accra (GMT+0)'), required: true, name: 'timezone' }) +
        UI.field({ label: 'Industry', value: text(b.industry), name: 'industry' }) + UI.field({ label: 'Tax identification number', value: text(b.tin), name: 'tin' }) +
        '</div></div><div class="card-foot"><span>Shown on invoices and customer messages</span><button class="btn primary sm" data-act="save-biz"' + (admin ? '' : ' disabled') + '>Save changes</button></div></section>';
    } else if (tab === 'notifications') {
      var prefs = NX.notificationPreferences || {};
      body = '<section class="card" style="max-width:820px"><table class="t matrix"><thead><tr><th>Notify me about</th><th>In app</th><th>Desktop</th><th>Email</th></tr></thead><tbody>' +
        PREF_ROWS.map(function (x) {
          return '<tr><td>' + esc(x[0]) + '</td>' + [['in app', x[1]], ['desktop', 'desktop'], ['email', 'email']].map(function (ch, i) {
            return '<td><input type="checkbox" ' + (prefs[ch[1]] ? 'checked' : '') + ' aria-label="' + esc(x[0] + ', ' + ch[0]) + '" data-change="pref" data-key="' + x[1] + '" data-ch="' + (i + 1) + '"></td>';
          }).join('') + '</tr>';
        }).join('') +
        '</tbody></table><div class="card-foot"><span>Desktop notifications use your Windows or macOS notification settings.</span></div></section>';
    } else if (tab === 'security') {
      var passwordEvent = arr(NX.audit).filter(function (e) { return e && /password/i.test(text(e.action)); })[0];
      var passwordMeta = passwordEvent ? 'Last recorded change: ' + whenValue(passwordEvent) : 'Password changes are recorded in the audit log.';
      var mfaBadge = b.mfaEnabled === undefined ? '<span class="badge">Not recorded</span>' : '<span class="badge ' + (b.mfaEnabled ? 'good' : '') + '">' + (b.mfaEnabled ? 'On' : 'Off') + '</span>';
      var sessions = arr(NX.sessions);
      body = '<div class="stack" style="max-width:820px"><section class="card"><div class="card-head"><h2>Password and verification</h2></div><ul class="list"><li><div class="grow"><div class="title">Password</div><div class="meta">' + esc(passwordMeta) + '</div></div><button class="btn sm" data-act="change-pw">Change password</button></li><li><div class="grow"><div class="title">Two-step verification</div><div class="meta">Code from an authenticator app when signing in on a new device</div></div>' + mfaBadge + '</li></ul></section>' +
        '<section class="card"><div class="card-head"><div><h2>Signed-in devices</h2><div class="sub">Sessions recorded for your account</div></div><button class="btn sm" data-act="signout-others">Sign out other devices</button></div><ul class="list">' +
        (sessions.length ? sessions.map(function (s) { return '<li>' + icon(text(s.icon, 'monitor')) + '<div class="grow"><div class="title">' + esc(text(s.device, 'Unknown device')) + (s.current ? ' <span class="badge accent">This device</span>' : '') + '</div><div class="meta">' + esc(text(s.where, 'Unknown location')) + ', ' + esc(whenValue(s)) + '</div></div>' + (s.current ? '' : '<button class="btn ghost sm" data-act="signout-one" data-id="' + esc(text(s.id)) + '">Sign out</button>') + '</li>'; }).join('') : '<li class="small faint">No sessions recorded.</li>') + '</ul></section></div>';
    } else if (tab === 'apps') {
      var appVersion = text(A.config && A.config.version);
      var versionLabel = appVersion ? 'Version ' + appVersion : 'Version not available';
      body = '<div class="grid g-3" style="max-width:1000px">' + [['globe', 'Web app', 'Any modern browser', 'Works in current Chrome, Edge, Safari and Firefox.', 'You are here'], ['monitor', 'Windows', versionLabel, 'Windows 10 and 11, 64-bit. Updates install automatically.', 'Download for Windows'], ['monitor', 'macOS', versionLabel, 'macOS 12 or later, Apple silicon and Intel.', 'Download for macOS']].map(function (x, i) {
        return '<section class="card"><div class="card-body"><div style="color:var(--text-2)">' + icon(x[0], 'i-l') + '</div><h2 class="mt-12">' + x[1] + '</h2><div class="small faint">' + x[2] + '</div><p class="small muted mt-8">' + x[3] + '</p><button class="btn ' + (i ? 'primary' : '') + ' sm mt-16"' + (i ? ' data-act="download-app"' : ' disabled') + '>' + (i ? icon('download', 'i-s') : '') + x[4] + '</button></div></section>';
      }).join('') + '</div><p class="small faint mt-16">All apps connect to the same workspace. A change made on one appears on the others within seconds.</p>';
    } else if (tab === 'audit') {
      var t = A.state.auditType || '';
      var rows2 = arr(NX.audit).filter(function (e) { return e && (!t || text(e.type) === t); });
      body = '<div class="card"><div class="toolbar"><div class="seg" role="group" aria-label="Actor type">' + [['', 'All'], ['Employee', 'Employees'], ['AI agent', 'AI agents'], ['Workflow', 'Workflows'], ['Integration', 'Integrations']].map(function (o) { return '<button data-act="audit-type" data-v="' + o[0] + '" aria-pressed="' + (t === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div><span class="small faint" style="margin-left:auto">' + icon('lock', 'i-s') + ' Read only. Records cannot be edited or deleted.</span></div>' +
        '<div class="table-wrap"><table class="t"><thead><tr><th>Time</th><th>Actor</th><th>Type</th><th>Action</th><th>Record</th><th>Result</th><th>Approval</th></tr></thead><tbody>' +
        (rows2.length ? rows2.map(function (e) {
          var type = text(e.type, 'Unknown');
          return '<tr><td class="small muted nowrap num">' + esc(whenValue(e)) + '</td><td class="strong">' + esc(text(e.actor, 'Unknown')) + '</td><td>' + (type === 'AI agent' ? '<span class="badge ai">AI agent</span>' : '<span class="badge outline">' + esc(type) + '</span>') + '</td><td>' + esc(text(e.action, 'Not recorded')) + '</td><td class="small">' + esc(text(e.res, 'Not recorded')) + '</td><td>' + UI.status(text(e.result, 'Not recorded')) + '</td><td class="small">' + (e.approval ? '<a href="#/agents/approvals">' + esc(e.approval) + '</a>' : '<span class="faint">None</span>') + '</td></tr>';
        }).join('') : '<tr><td colspan="7">' + UI.empty('No audit events', 'Recorded activity will appear here.') + '</td></tr>') +
        '</tbody></table></div><div class="pager"><span>' + rows2.length + ' events. Workspace ' + esc(text(b.id, 'Not recorded')) + '</span><button class="btn sm" data-act="export">' + icon('download', 'i-s') + 'Export</button></div></div>';
    } else if (tab === 'data') {
      var policy = b.retentionPolicy || {};
      var dayOption = function (label) { return [String(RETENTION_DAYS[label]), label]; };
      body = '<div class="stack" style="max-width:820px"><section class="card"><div class="card-head"><div><h2>Export workspace data</h2><div class="sub">Customers, orders, invoices, products and conversations as CSV files</div></div><button class="btn sm" data-act="export">' + icon('download', 'i-s') + 'Request export</button></div></section>' +
        '<section class="card"><div class="card-head"><h2>Retention</h2></div><div class="card-body form-grid" id="retention">' +
        UI.field({ label: 'Keep conversations for', type: 'select', name: 'messageDays', options: [dayOption('1 year'), dayOption('3 years'), dayOption('7 years'), dayOption('Until deleted')], value: String(policy.messageDays === undefined ? 1095 : policy.messageDays), required: true }) +
        UI.field({ label: 'Keep audit log for', type: 'select', name: 'auditLogDays', options: [dayOption('3 years'), dayOption('7 years')], value: String(policy.auditLogDays === undefined ? 2555 : policy.auditLogDays), required: true }) +
        '<input type="hidden" name="sessionDays" value="' + esc(String(policy.sessionDays === undefined ? 30 : policy.sessionDays)) + '">' +
        '<input type="hidden" name="backupDays" value="' + esc(String(policy.backupDays === undefined ? 90 : policy.backupDays)) + '">' +
        '<input type="hidden" name="enabled" value="' + (policy.enabled === false ? 'false' : 'true') + '">' +
        '</div><div class="card-foot"><span>Financial records are kept for the period required by applicable tax rules.</span><button class="btn sm primary" data-act="saved">Save</button></div></section>' +
        '<section class="card"><div class="card-head"><div><h2>Delete a customer\'s personal data</h2><div class="sub">Removes contact details and messages. Orders and invoices keep an anonymised reference.</div></div><button class="btn danger sm" data-act="erase">Start a deletion request</button></div></section></div>';
    } else {
      var cur = document.documentElement.getAttribute('data-theme');
      body = '<section class="card" style="max-width:820px"><div class="card-body"><div class="label" style="margin-bottom:10px">Theme</div><div class="levels" style="max-width:420px"><button class="level" data-act="set-theme" data-v="light" aria-pressed="' + (cur === 'light') + '"><b>Light</b><span>Best in bright rooms</span></button><button class="level" data-act="set-theme" data-v="dark" aria-pressed="' + (cur === 'dark') + '"><b>Dark</b><span>Easier at night</span></button></div></div></section>';
    }
    return '<div class="page">' + A.head('Settings', '', '') + A.tabBar('settings', tabs, tab) + body + '</div>';
  };
  A.actions['save-biz'] = function () {
    var f = document.getElementById('biz');
    if (!f || !UI.validate(f)) return;
    var v = A.readForm(f), patch = {};
    ['name', 'email', 'phone', 'address', 'currency', 'timezone', 'industry', 'tin'].forEach(function (k) { if (v[k] !== undefined) patch[k] = v[k]; });
    return NXActions.run(function () { return NXApi.mutate('PATCH', '/businesses/current', patch); }, 'Business profile saved', 'Could not save business profile');
  };
  A.actions['audit-type'] = function (el) { A.state.auditType = el.getAttribute('data-v'); A.render(); };
  A.actions['set-theme'] = function (el) { A.setTheme(el.getAttribute('data-v')); A.render(); };
  A.actions.pref = function (el) {
    var channel = el.getAttribute('data-ch');
    var key = channel === '2' ? 'desktop' : channel === '3' ? 'email' : (el.getAttribute('data-key') || 'inApp');
    return NXActions.run(function () {
      return NXApi.request('GET', '/notifications/preferences').then(function (current) {
        var prefs = Object.assign({}, current || {});
        prefs[key] = el.checked;
        return NXApi.mutate('PUT', '/notifications/preferences', { preferences: prefs });
      });
    }, 'Preference saved', 'Could not save preference');
  };
  A.actions.saved = function () {
    var f = document.getElementById('retention');
    if (!f || !UI.validate(f)) return;
    var v = A.readForm(f);
    var payload = {
      messageDays: Number(v.messageDays), auditLogDays: Number(v.auditLogDays),
      sessionDays: Number(v.sessionDays), backupDays: Number(v.backupDays),
      enabled: v.enabled !== 'false'
    };
    return NXActions.run(function () { return NXApi.mutate('PUT', '/data/retention', payload); }, 'Retention settings saved', 'Could not save retention settings');
  };
  A.actions['download-app'] = function () { UI.toast('Download starts from your Nexora account page.'); };
  A.actions['signout-others'] = function () {
    return NXActions.run(function () { return NXApi.mutate('POST', '/auth/sessions/revoke-others', {}); }, 'Signed out of all other devices', 'Could not sign out other devices');
  };
  A.actions['signout-one'] = function (el) {
    var id = el.getAttribute('data-id');
    if (!id) return;
    return NXActions.run(function () { return NXApi.mutate('DELETE', '/auth/sessions/' + id); }, 'Device signed out', 'Could not sign out this device');
  };
  A.actions['change-pw'] = function () {
    UI.modal({ title: 'Change password', ok: 'Change password', body: '<div class="stack" style="gap:12px">' + UI.field({ label: 'Current password', type: 'password', required: true, name: 'currentPassword' }) + UI.field({ label: 'New password', type: 'password', required: true, hint: 'At least 10 characters.', name: 'newPassword', err: 'Use at least 10 characters.' }) + '</div>',
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var v = A.readForm(m);
        if (v.newPassword.length < 10) { m.querySelector('[name=newPassword]').closest('.field').classList.add('has-err'); return false; }
        return NXActions.run(function () {
          return NXApi.mutate('POST', '/auth/password/change', { currentPassword: v.currentPassword, newPassword: v.newPassword });
        }, 'Password changed. Other devices were signed out.', 'Could not change password');
      } });
  };
  A.actions.erase = function () {
    UI.modal({ title: 'Delete a customer\'s personal data', body: UI.field({ label: 'Customer', type: 'select', required: true, placeholder: 'Choose a customer', name: 'customer', options: arr(NX.customers).map(function (c) { return [text(c && c.id), nm(c, text(c && c.id, 'Unnamed customer'))]; }) }) +
      UI.field({ label: 'Confirmation', required: true, name: 'confirmation', placeholder: 'Type DELETE', hint: 'Type DELETE exactly to confirm.', err: 'Type DELETE to confirm this request.' }) +
      '<p class="small muted mt-12">Contact details are redacted as soon as you confirm. Orders and invoices keep an anonymised reference, and this cannot be undone.</p>',
      foot: '<button class="btn" data-close>Cancel</button><button class="btn danger solid" data-ok>Submit request</button>', onOk: function (m) {
        if (!UI.validate(m)) return false;
        var v = A.readForm(m);
        if (v.confirmation !== 'DELETE') { m.querySelector('[name=confirmation]').closest('.field').classList.add('has-err'); return false; }
        return NXActions.run(function () {
          return NXApi.mutate('POST', '/data/delete', { collection: 'customers', id: v.customer, confirmation: v.confirmation });
        }, 'Deletion request submitted', 'Could not submit deletion request');
      } });
  };
})();
