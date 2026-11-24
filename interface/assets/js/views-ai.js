/* Views: automation, AI agents and approvals, analytics, integrations, settings. */
(function () {
  var A = App, esc = UI.esc, money = UI.money;

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
    var conditions = (d.conds || []).filter(function (c) { return c[0]; }).map(function (c) {
      return { field: CONDITION_KEYS[c[0]] || String(c[0]).toLowerCase().replace(/\s+/g, '_'), operator: OPERATOR_KEYS[c[1]] || 'equals', value: c[2] };
    });
    var labels = (d.actions || []).filter(Boolean);
    var actions = labels.map(function (label) {
      var type = ACTION_KEYS[label] || 'notify';
      var action = { type: type, title: label, who: 'e1' };
      if (type === 'trigger_agent') action.agentId = agentIdFor(label);
      if (type === 'create_task') { action.due = 'Today'; action.priority = 'Normal'; }
      if (type === 'notify') { action.body = label; action.go = '#/automation'; }
      return action;
    });
    return {
      name: d.name, label: d.name, trigger: d.trigger, conds: (d.conds || []).filter(function (c) { return c[0]; }),
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
    (conds || []).forEach(function (c) {
      if (!c[0]) return;
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
      body = '<div class="card"><ul class="list">' + NX.workflows.map(function (w) {
        var rate = w.runs ? Math.round(w.ok / w.runs * 1000) / 10 : null;
        return '<li style="align-items:flex-start;padding:16px 18px"><label class="switch" style="margin-top:2px"><input type="checkbox" ' + (w.on ? 'checked' : '') + ' data-change="wf-toggle" data-id="' + w.id + '" aria-label="' + (w.on ? 'Deactivate' : 'Activate') + ' ' + esc(w.name) + '"><span></span></label>' +
          '<div class="grow"><div class="row" style="gap:8px"><a class="title" href="#/automation/w/' + w.id + '" style="color:var(--text)">' + esc(w.name) + '</a>' + (w.approval ? '<span class="badge warn">' + icon('shield', 'i-s') + 'Needs approval</span>' : '') + (!w.on ? '<span class="badge">Off</span>' : '') + '</div>' +
          '<div class="small muted mt-8" style="margin-top:4px"><span class="step-kind when">When</span> ' + esc(w.trigger) + '&nbsp; <span class="step-kind if">If</span> ' + w.conds.map(function (c) { return esc(c.join(' ')); }).join(' and ') + '&nbsp; <span class="step-kind then">Then</span> ' + esc(w.actions.join(', then ')) + '</div></div>' +
          '<div style="text-align:right;min-width:150px"><div class="num strong">' + w.runs + ' runs</div><div class="small ' + (rate !== null && rate < 95 ? 'down' : 'faint') + '">' + (rate === null ? 'Not run yet' : rate + '% succeeded') + '</div><div class="small faint">Last: ' + esc(w.last) + '</div></div></li>';
      }).join('') + '</ul></div>';
    } else {
      body = '<div class="card"><table class="t"><thead><tr><th>When</th><th>Workflow</th><th>Result</th><th>Duration</th><th>Details</th><th></th></tr></thead><tbody>' +
        NX.executions.map(function (x) { return '<tr><td class="small muted nowrap">' + esc(x.when) + '</td><td class="strong">' + esc(NX.byId(NX.workflows, x.wf).name) + '</td><td>' + UI.status(x.result) + '</td><td class="num small">' + x.dur + '</td><td class="small">' + esc(x.detail) + '</td><td>' + (x.result === 'Failed' ? '<button class="btn sm" data-act="wf-retry" data-id="' + x.id + '">' + icon('refresh', 'i-s') + 'Retry now</button>' : '') + '</td></tr>'; }).join('') +
        '</tbody></table></div><p class="small faint mt-12">Failed runs retry automatically up to 3 times. Each event is processed once, even if a provider sends it twice.</p>';
    }
    return '<div class="page">' + A.head('Automation', 'Workflows run in the background when business events happen. Sensitive actions stop for approval.', '<a class="btn primary" href="#/automation/new">' + icon('plus', 'i-s') + 'New workflow</a>') +
      A.tabBar('automation', [['', 'Workflows', NX.workflows.length], ['history', 'Run history']], tab) + body + '</div>';
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
          draft.conds.map(function (c, i) { return '<div class="cond-row">' + sel(COND_FIELDS, c[0], 'data-change="wf-cond" data-i="' + i + '" data-k="0" aria-label="Condition field"') + sel(OPS, c[1], 'data-change="wf-cond" data-i="' + i + '" data-k="1" aria-label="Operator"') + '<input class="input input-sm" value="' + esc(c[2]) + '" data-change="wf-cond" data-i="' + i + '" data-k="2" aria-label="Value" placeholder="Value"><button class="icon-btn" data-act="wf-cond-rm" data-i="' + i + '" aria-label="Remove condition">' + icon('x', 'i-s') + '</button></div>'; }).join('') +
          '<button class="btn ghost sm" style="align-self:flex-start" data-act="wf-cond-add">' + icon('plus', 'i-s') + 'Add condition</button></div></section>' +
        '<div class="connector"></div>' +
        '<section class="step"><div class="step-head"><span class="step-kind then">Then</span><b>Do these in order</b></div><div class="step-body">' +
          draft.actions.map(function (a, i) { return '<div class="row"><span class="faint small num" style="width:18px">' + (i + 1) + '.</span><div class="field" style="flex:1">' + sel(ACTIONS, a, 'data-change="wf-action" data-i="' + i + '" aria-label="Action ' + (i + 1) + '"' + (i === 0 ? ' required' : '')) + '<span class="err">Choose at least one action.</span></div>' + (draft.actions.length > 1 ? '<button class="icon-btn" data-act="wf-action-rm" data-i="' + i + '" aria-label="Remove action">' + icon('x', 'i-s') + '</button>' : '') + '</div>'; }).join('') +
          '<button class="btn ghost sm" style="align-self:flex-start" data-act="wf-action-add">' + icon('plus', 'i-s') + 'Add action</button></div></section>' +
        '<section class="card mt-16"><div class="card-body stack" style="gap:12px">' +
          '<label class="check"><input type="checkbox" ' + (draft.approval ? 'checked' : '') + ' data-change="wf-approval"><span><b style="font-weight:600">Stop for approval before acting</b><br><span class="small muted">Required automatically for refunds, payments, permission changes and deletions.</span></span></label>' +
          '<div class="row small muted" style="gap:8px">' + icon('refresh', 'i-s') + 'Retries failed steps up to 3 times, 5 minutes apart. Duplicate events are ignored.</div>' +
        '</div></section>' +
      '</div></div>';
  }
  var D = function () { return A.state.wfDraft; };
  A.actions['wf-name'] = function (el) { D().name = el.value; };
  A.actions['wf-trigger'] = function (el) { D().trigger = el.value; };
  A.actions['wf-cond'] = function (el) { D().conds[+el.getAttribute('data-i')][+el.getAttribute('data-k')] = el.value; };
  A.actions['wf-cond-add'] = function () { D().conds.push(['', 'is', '']); A.render(); };
  A.actions['wf-cond-rm'] = function (el) { D().conds.splice(+el.getAttribute('data-i'), 1); A.render(); };
  A.actions['wf-action'] = function (el) { D().actions[+el.getAttribute('data-i')] = el.value; };
  A.actions['wf-action-add'] = function () { D().actions.push(''); A.render(); };
  A.actions['wf-action-rm'] = function (el) { D().actions.splice(+el.getAttribute('data-i'), 1); A.render(); };
  A.actions['wf-approval'] = function (el) { D().approval = el.checked; };
  A.actions['wf-test'] = function () {
    var d = D();
    if (!d) return;
    var payload = workflowPayload(d);
    var id = d.id !== 'new' ? d.id : (NX.workflows[0] && NX.workflows[0].id);
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
        '<li class="' + (failures ? 'bad' : 'good') + '"><div>' + checks.length + ' conditions checked, ' + (failures ? failures + ' not matched' : 'all true') + '</div><div class="when">0.2 s</div></li>' +
        (result.actions || []).map(function (a) { return '<li class="' + (d.approval ? '' : 'good') + '"><div>' + esc(a.title || a.type) + (d.approval ? ' (would wait for approval)' : ' (would run)') + '</div><div class="when">0.4 s</div></li>'; }).join('') + '</ul>' });
    });
  };
  A.actions['wf-save'] = function () {
    var d = D(), root = document.getElementById('wf');
    if (!d || !root) return;
    root.querySelector('#wf-name').closest('.field').classList.toggle('has-err', !d.name.trim());
    root.querySelector('[data-change="wf-trigger"]').closest('.field').classList.toggle('has-err', !d.trigger);
    var a0 = root.querySelector('[data-change="wf-action"]'); a0.closest('.field').classList.toggle('has-err', !d.actions.filter(Boolean).length);
    if (!d.name.trim() || !d.trigger || !d.actions.filter(Boolean).length) { var b = root.querySelector('.has-err .input'); if (b) b.focus(); return; }
    d.conds = d.conds.filter(function (c) { return c[0]; }); d.actions = d.actions.filter(Boolean);
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
    }, w.name + (el.checked ? ' activated' : ' deactivated'), 'Could not update workflow');
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
    var pending = NX.approvals.filter(function (a) { return a.status === 'Pending'; });
    var body;
    if (!tab) {
      body = '<div class="grid g-3">' + NX.agents.map(function (a) {
        return '<section class="card agent-card"><div class="a-top">' + UI.agentAvatar(a.short, 'l') + '<div style="flex:1;min-width:0"><div class="row between"><a href="#/agents/a/' + a.id + '" style="color:var(--text)"><h2>' + esc(a.name) + '</h2></a><label class="switch"><input type="checkbox" ' + (a.on ? 'checked' : '') + ' data-change="agent-toggle" data-id="' + a.id + '" aria-label="' + (a.on ? 'Turn off ' : 'Turn on ') + esc(a.name) + '"' + (A.isAdmin() ? '' : ' disabled') + '><span></span></label></div>' +
          '<p class="a-desc">' + esc(a.desc) + '</p><div class="mt-8"><span class="badge ' + (displayLevel(a.level) === 'execute' ? 'accent' : displayLevel(a.level) === 'approve' ? 'warn' : '') + '">' + levelNames[displayLevel(a.level)] + '</span></div></div></div>' +
          '<div class="a-stats"><div><b>' + a.runs + '</b><span>Actions</span></div><div><b>' + (a.runs ? a.success + '%' : 'None') + '</b><span>Succeeded</span></div><div><b>' + a.escal + '</b><span>Escalated</span></div></div>' +
          '<div class="card-foot"><span class="row" style="gap:8px;flex:1">Usage <span class="meter" style="flex:1;max-width:120px"><i style="width:' + a.usage + '%"></i></span>' + a.usage + '% of limit</span><a href="#/agents/a/' + a.id + '">Configure</a></div></section>';
      }).join('') + '</div>' +
      '<div class="callout mt-16">' + icon('lock') + '<div>Agents are predefined. Each one has its own permission list and never inherits the permissions of the person who turned it on. Agents read data through the same server rules as employees, and every action is logged.</div></div>';
    } else if (tab === 'approvals') {
      var list = NX.approvals.slice().sort(function (a, b) { return (a.status === 'Pending' ? 0 : 1) - (b.status === 'Pending' ? 0 : 1); });
      body = '<div class="card">' + list.map(function (ap) {
        var isAI = ap.requesterType === 'ai';
        return '<article class="approval"><div class="row" style="gap:10px;align-items:flex-start"><span style="color:' + (isAI ? 'var(--ai)' : 'var(--text-2)') + ';margin-top:2px">' + icon(isAI ? 'sparkle' : 'user') + '</span><div style="flex:1;min-width:0"><div class="row wrap" style="gap:8px"><h3 style="font-size:14.5px">' + esc(ap.op) + '</h3>' + UI.status(ap.status) + '<span class="badge ' + (ap.risk === 'High' ? 'bad' : ap.risk === 'Medium' ? 'warn' : '') + '">' + ap.risk + ' risk</span></div>' +
          '<dl class="ap-grid"><dt>Requested by</dt><dd>' + (isAI ? '<span class="badge ai">' + esc(ap.requester) + '</span>' : esc(ap.requester)) + ', ' + esc(ap.when) + '</dd><dt>Affected record</dt><dd>' + esc(ap.record) + '</dd><dt>Reason</dt><dd>' + esc(ap.reason) + '</dd>' +
          (ap.reviewer ? '<dt>Reviewed by</dt><dd>' + esc(ap.reviewer) + ', ' + esc(ap.decided) + '</dd><dt>Result</dt><dd>' + esc(ap.result) + (ap.note ? '. ' + esc(ap.note) : '') + '</dd>' : '') + '<dt>Reference</dt><dd class="faint">' + ap.id + '</dd></dl>' +
          (ap.status === 'Pending' ? '<div class="row"><button class="btn primary sm" data-act="approve" data-id="' + ap.id + '">' + icon('check', 'i-s') + 'Approve</button><button class="btn sm" data-act="reject" data-id="' + ap.id + '">Reject</button>' + (ap.kind === 'Refund' ? '<a class="btn ghost sm" href="#/inbox/v6">View conversation</a>' : ap.kind === 'Order confirmation' ? '<a class="btn ghost sm" href="#/orders/o/ORD-10478">View draft order</a>' : '') + '</div>' : '') +
          '</div></div></article>';
      }).join('') + '</div>';
    } else {
      var rows = [
        ['Today, 14:30', 'Sales Agent', 'Prepared draft order', 'orders.create_draft', 'Darko Schools Complex', 'Waiting for approval'],
        ['Today, 14:03', 'Sales Agent', 'Replied with price and stock', 'products.search, inventory.check_availability', 'Darko Schools Complex', 'Succeeded'],
        ['Today, 13:47', 'Customer Support Agent', 'Answered warranty question', 'products.get, policies.get', 'Yaw Osei', 'Succeeded'],
        ['Today, 10:13', 'Customer Support Agent', 'Checked delivery status', 'orders.get', 'Kpodo Co-working', 'Succeeded'],
        ['Today, 09:56', 'Customer Support Agent', 'Requested refund, escalated', 'approvals.request', 'Frimpong Events', 'Escalated'],
        ['Today, 08:10', 'Inventory Agent', 'Prepared purchase request PR-0221', 'inventory.list, purchase_requests.create_draft', 'Accra Paper Mart', 'Waiting for approval'],
        ['Today, 08:00', 'Finance Assistant', 'Prepared overdue reminders', 'invoices.list, reminders.prepare', '2 invoices', 'Succeeded'],
        ['Yesterday, 18:00', 'Operations Assistant', 'Escalated overdue tasks', 'tasks.list, notifications.send', '2 tasks', 'Succeeded'],
        ['Yesterday, 15:21', 'Customer Support Agent', 'Declined to confirm payment', 'payments.list', 'Asante Logistics', 'Escalated']
      ];
      body = '<div class="card"><table class="t"><thead><tr><th>When</th><th>Agent</th><th>What it did</th><th>Tools used</th><th>Record</th><th>Result</th></tr></thead><tbody>' +
        rows.map(function (x) { return '<tr><td class="small muted nowrap">' + x[0] + '</td><td><span class="badge ai">' + esc(x[1]) + '</span></td><td>' + esc(x[2]) + '</td><td class="small"><code style="font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--text-2)">' + esc(x[3]) + '</code></td><td class="small">' + esc(x[4]) + '</td><td>' + (x[5] === 'Escalated' ? '<span class="badge warn">Escalated</span>' : UI.status(x[5])) + '</td></tr>'; }).join('') +
        '</tbody></table></div>';
    }
    return '<div class="page">' + A.head('AI agents', NX.agents.filter(function (a) { return a.on; }).length + ' of ' + NX.agents.length + ' agents on. ' + pending.length + ' actions waiting for approval.', '') +
      A.tabBar('agents', [['', 'Agents', NX.agents.length], ['approvals', 'Approvals', pending.length], ['history', 'Execution history']], tab) + body + '</div>';
  };

  function agentDetail(a) {
    if (!a) return '<div class="page">' + UI.empty('Agent not found', 'It may have been removed.', '<a class="btn" href="#/agents">All agents</a>') + '</div>';
    var ed = A.isAdmin();
    return '<div class="page"><div class="page-head"><div><a href="#/agents" class="small row" style="gap:4px;margin-bottom:6px">' + icon('chevronLeft', 'i-s') + 'AI agents</a><div class="row" style="gap:12px">' + UI.agentAvatar(a.short, 'l') + '<div><h1>' + esc(a.name) + '</h1><p class="muted">' + esc(a.desc) + '</p></div></div></div>' +
      '<div class="actions"><span class="small muted">' + (a.on ? 'On' : 'Off') + '</span><label class="switch"><input type="checkbox" ' + (a.on ? 'checked' : '') + ' data-change="agent-toggle" data-id="' + a.id + '" aria-label="Agent on or off"' + (ed ? '' : ' disabled') + '><span></span></label></div></div>' +
      '<div class="grid g-main"><div class="stack">' +
        '<section class="card"><div class="card-head"><div><h2>How much it can do on its own</h2><div class="sub">You can lower this at any time. High-risk actions always need a person.</div></div></div><div class="card-body"><div class="levels" role="group" aria-label="Automation level">' +
          ['suggest', 'approve', 'execute'].map(function (l) { return '<button class="level" data-act="agent-level" data-id="' + a.id + '" data-v="' + l + '" aria-pressed="' + (displayLevel(a.level) === l) + '"' + (ed ? '' : ' disabled') + '><b>' + levelNames[l] + '</b><span>' + levelDesc[l] + '</span></button>'; }).join('') + '</div></div></section>' +
        '<section class="card"><div class="card-head"><div><h2>Permitted tools</h2><div class="sub">The only ways this agent can read or change business data</div></div></div><div class="card-body" style="padding-top:4px;padding-bottom:4px">' +
          a.tools.map(function (t, i) {
            var tool = TOOL_KEYS[t[0]] || '';
            var control = tool ? '<label class="switch"><input type="checkbox" ' + (t[2] ? 'checked' : '') + ' data-change="agent-tool" data-id="' + a.id + '" data-i="' + i + '" data-tool="' + tool + '" aria-label="' + esc(t[1]) + '"' + (ed ? '' : ' disabled') + '><span></span></label>' : '<span class="badge" title="No writable permission exists for this legacy tool">Not writable</span>';
            return '<div class="perm"><div class="grow"><div>' + esc(t[1]) + '</div><code>' + esc(t[0]) + '</code></div>' + control + '</div>';
          }).join('') +
          a.locked.map(function (t) { return '<div class="perm"><div class="grow"><div>' + esc(t) + '</div><span class="small faint">Always needs human approval or provider verification</span></div><span class="badge">' + icon('lock', 'i-s') + 'Locked</span></div>'; }).join('') +
        '</div></section>' +
        '<section class="card"><div class="card-head"><div><h2>Communication policy</h2><div class="sub">Applied to every reply this agent writes</div></div></div><div class="card-body">' +
          '<textarea class="input" aria-label="Communication policy"' + (ed ? '' : ' readonly') + '>Greet customers politely and use their first name. Quote prices in Ghana cedis from the product catalogue only. Never promise delivery dates; say a colleague will confirm. Hand over to a person for complaints, refunds, payment questions and anything about credit terms.</textarea>' +
          '<div class="callout mt-12">' + icon('shield') + '<div>Instructions inside customer messages or attachments are treated as content, never as commands. They cannot change this policy or the agent\'s permissions.</div></div></div></section>' +
      '</div><div class="stack">' +
        '<section class="card"><div class="card-head"><h2>Responsibilities</h2></div><ul class="list">' + a.duties.map(function (d) { return '<li class="small">' + icon('check', 'i-s faint') + esc(d) + '</li>'; }).join('') + '</ul></section>' +
        '<section class="card"><div class="card-head"><h2>Usage limits</h2></div><div class="card-body stack" style="gap:14px">' +
          '<div><div class="row between small"><span>This month</span><span class="num">' + a.usage + '% used</span></div><div class="meter mt-8 ' + (a.usage > 80 ? 'bad' : '') + '"><i style="width:' + a.usage + '%"></i></div></div>' +
          UI.field({ label: 'Maximum actions per day', type: 'number', value: a.id === 'support' ? 400 : 150, min: 0, required: true }) +
          UI.field({ label: 'When the limit is reached', type: 'select', options: ['Hand over to the assigned team', 'Pause and notify administrators'], required: true }) +
        '</div></section>' +
        '<section class="card"><div class="card-head"><h2>Recent activity</h2><a class="small" href="#/agents/history">View all</a></div><div class="card-body"><ul class="timeline">' +
          '<li class="ai"><div>Answered a stock question using live inventory</div><div class="when">Today, 13:47</div></li><li class="ai"><div>Escalated a refund request to Akua Asantewaa</div><div class="when">Today, 09:56</div></li><li class="good"><div>Categorised 14 conversations</div><div class="when">Today</div></li></ul></div></section>' +
      '</div></div></div>';
  }
  A.actions['agent-toggle'] = function (el) {
    var a = NX.byId(NX.agents, el.getAttribute('data-id'));
    if (!a) return;
    return NXActions.run(function () {
      return NXApi.mutate('PATCH', '/agents/' + a.id, { enabled: el.checked, on: el.checked });
    }, a.name + (el.checked ? ' turned on' : ' turned off. Its conversations move to people.'), 'Could not update agent');
  };
  A.actions['agent-level'] = function (el) {
    var a = NX.byId(NX.agents, el.getAttribute('data-id'));
    if (!a) return;
    var level = el.getAttribute('data-v');
    return NXActions.run(function () {
      return NXApi.mutate('POST', '/agents/' + a.id + '/configure', { automationLevel: level === 'approve' ? 'prepare' : level });
    }, a.name + ' set to ' + levelNames[level].toLowerCase(), 'Could not update automation level');
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
      UI.modal({ title: 'Approve ' + ap.kind.toLowerCase() + '?', body: '<p>' + esc(ap.op) + '.</p><p class="muted mt-12">This will be queued for execution and recorded against your name.</p>', foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Approve and execute</button>',
        onOk: function () { return decide(ap, true); } });
    } else { return decide(ap, true); }
  };
  A.actions.reject = function (el) {
    var ap = NX.byId(NX.approvals, el.getAttribute('data-id'));
    if (!ap) return;
    UI.modal({ title: 'Reject request', ok: 'Reject', body: '<p class="muted" style="margin-bottom:12px">' + esc(ap.op) + '</p>' + UI.field({ label: 'Reason', type: 'textarea', required: true, name: 'note', err: 'Tell the requester why, so they know what to do next.' }),
      foot: '<button class="btn" data-close>Cancel</button><button class="btn danger solid" data-ok>Reject</button>',
      onOk: function (m) { if (!UI.validate(m)) return false; return decide(ap, false, A.readForm(m).note); } });
  };

  /* ================= Analytics ================= */
  A.views.analytics = function (r) {
    var tab = r.sub || '';
    var range = A.state.anRange || '30d';
    var days = NX.sales30.map(function (_, i) { var d = new Date(2026, 10, 24 - (29 - i)); return d.getDate() + ' ' + ['Oct', 'Nov'][d.getMonth() - 9]; });
    var body;
    var summary = function (text, sources) {
      return '<section class="card" style="margin-bottom:16px"><div class="card-body"><div class="row" style="gap:8px;margin-bottom:8px">' + icon('sparkle', 'i-s') + '<b style="font-weight:600">Summary by Business Analyst</b><span class="badge">Generated today, 08:00</span></div><p style="max-width:80ch">' + text + '</p>' +
        '<div class="row wrap mt-12" style="gap:6px"><span class="small faint">Based on</span>' + sources.map(function (s) { return '<span class="tag">' + icon('layers', 'i-s') + '&nbsp;' + esc(s) + '</span>'; }).join('') + '</div></div></section>';
    };
    if (!tab) {
      body = summary('Sales for the last 30 days were ' + money(NX.sales30.reduce(function (a, b) { return a + b; }, 0), { dp: 0 }) + ', 14.6% higher than the previous 30 days, led by WhatsApp orders from wholesale customers. Two invoices worth ' + money(10780, { dp: 0 }) + ' are overdue. A4 paper and UPS units are the main stock risks: both sell faster than they are being reordered.', ['128 orders', '8 invoices', '12 products', '30 days of payments']) +
        '<div class="grid g-2"><section class="card"><div class="card-head flat"><div><h2>Daily sales</h2><div class="sub">Order value, GHS</div></div>' + UI.legend([{ name: 'This period', color: 'var(--series-1)', line: true }, { name: 'Previous', color: 'var(--text-3)', line: true, dashed: true }]) + '</div><div class="card-body">' +
          UI.chart('an-sales', { type: 'line', height: 240, labels: days, series: [{ name: 'This period', values: NX.sales30, color: 'var(--series-1)' }, { name: 'Previous', values: NX.sales30prev, color: 'var(--text-3)', dashed: true }], tipFmt: function (v) { return money(v, { dp: 0 }); } }) + '</div></section>' +
        '<section class="card"><div class="card-head"><div><h2>Sales by channel</h2><div class="sub">Last 30 days, GHS</div></div></div><div class="card-body">' + UI.hbars(NX.salesByChannel, function (v) { return money(v, { dp: 0 }); }) + '</div></section></div>' +
        '<div class="grid g-3 mt-16">' +
          '<section class="card"><div class="card-head"><h2>Top products</h2><span class="sub">Units, 30 days</span></div><div class="card-body">' + UI.hbars(NX.products.slice().sort(function (a, b) { return b.sold30 - a.sold30; }).slice(0, 5).map(function (p) { return [p.name.split(' (')[0], p.sold30]; })) + '</div></section>' +
          '<section class="card"><div class="card-head"><h2>Customers</h2><span class="sub">30 days</span></div><div class="card-body"><dl class="kv" style="grid-template-columns:1fr auto;row-gap:10px"><dt>New customers</dt><dd class="num strong">14</dd><dt>Repeat buyers</dt><dd class="num strong">38</dd><dt>Average order</dt><dd class="num strong">' + money(5420, { dp: 0 }) + '</dd><dt>Wholesale share</dt><dd class="num strong">57%</dd></dl></div></section>' +
          '<section class="card"><div class="card-head"><h2>Workflows and AI</h2><span class="sub">30 days</span></div><div class="card-body"><dl class="kv" style="grid-template-columns:1fr auto;row-gap:10px"><dt>Workflow runs</dt><dd class="num strong">529</dd><dt>Succeeded</dt><dd class="num strong">98.9%</dd><dt>AI actions</dt><dd class="num strong">822</dd><dt>Escalated to people</dt><dd class="num strong">58</dd></dl></div></section>' +
        '</div>';
    } else if (tab === 'communication') {
      body = summary('Customers wrote 905 times in the last 14 days. AI agents resolved 61% without help, and the median first response was 3 minutes 40 seconds. Most escalations were payment and refund questions, which agents are not allowed to settle.', ['905 messages', '6 channels', '58 escalations']) +
        '<section class="card"><div class="card-head flat"><div><h2>Conversations per day</h2><div class="sub">Last 14 days</div></div>' + UI.legend([{ name: 'All conversations', color: 'var(--series-1)' }, { name: 'Handled by AI', color: 'var(--series-2)' }]) + '</div><div class="card-body">' +
          UI.chart('an-conv', { type: 'bar', height: 240, labels: ['11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24'], tipLabels: ['11 Nov', '12 Nov', '13 Nov', '14 Nov', '15 Nov', '16 Nov', '17 Nov', '18 Nov', '19 Nov', '20 Nov', '21 Nov', '22 Nov', '23 Nov', '24 Nov'], series: [{ name: 'All conversations', values: NX.convVolume, color: 'var(--series-1)' }, { name: 'Handled by AI', values: NX.aiHandled, color: 'var(--series-2)' }] }) + '</div></section>' +
        '<section class="card mt-16"><table class="t"><thead><tr><th>Channel</th><th class="num">Conversations</th><th class="num">First response</th><th class="num">Resolved</th><th class="num">AI share</th></tr></thead><tbody>' +
          [['WhatsApp', 418, '2m 50s', '91%', '64%'], ['Website chat', 186, '0m 40s', '95%', '81%'], ['Email', 141, '22m 10s', '88%', '32%'], ['Instagram', 74, '6m 05s', '84%', '58%'], ['Telegram', 52, '3m 15s', '92%', '70%'], ['Messenger', 34, '4m 30s', '90%', '62%']].map(function (x) { return '<tr><td>' + x[0] + '</td><td class="num">' + x[1] + '</td><td class="num">' + x[2] + '</td><td class="num">' + x[3] + '</td><td class="num">' + x[4] + '</td></tr>'; }).join('') +
        '</tbody></table></section>';
    } else {
      body = '<section class="card"><table class="t"><thead><tr><th>Employee</th><th>Department</th><th class="num">Tasks done</th><th class="num">Open</th><th class="num">Conversations</th><th class="num">Orders</th></tr></thead><tbody>' +
        NX.employees.filter(function (e) { return e.status === 'active'; }).map(function (e) { return '<tr><td><div class="cell-2">' + UI.avatar(e.name, 's') + esc(e.name) + '</div></td><td class="muted">' + esc(NX.dept(e.dept).name) + '</td><td class="num">' + e.tasksDone + '</td><td class="num">' + e.tasksOpen + '</td><td class="num">' + (e.dept === 'd3' ? 140 + e.tasksDone : e.dept === 'd2' ? 60 + e.tasksDone : 0) + '</td><td class="num">' + NX.orders.filter(function (o) { return o.by === e.id; }).length + '</td></tr>'; }).join('') +
        '</tbody></table></section><p class="small faint mt-12">Figures count work recorded in Nexora. They are a starting point for conversations, not a ranking.</p>';
    }
    return '<div class="page">' + A.head('Analytics', 'Calculated from records in this workspace that your role can see.', '<div class="seg" role="group" aria-label="Date range">' + [['7d', '7 days'], ['30d', '30 days'], ['q', 'Quarter'], ['y', 'Year']].map(function (o) { return '<button data-act="an-range" data-v="' + o[0] + '" aria-pressed="' + (range === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div><button class="btn" data-act="export">' + icon('download', 'i-s') + 'Export</button>') +
      A.tabBar('analytics', [['', 'Business'], ['communication', 'Communication'], ['people', 'Team']], tab) + body + '</div>';
  };
  A.actions['an-range'] = function (el) { A.state.anRange = el.getAttribute('data-v'); A.render(); };

  /* ================= Integrations ================= */
  A.views.integrations = function () {
    var cats = [];
    NX.integrations.forEach(function (i) { if (cats.indexOf(i.cat) === -1) cats.push(i.cat); });
    return '<div class="page">' + A.head('Integrations', 'Connect the services your business already uses. Nexora works on its own; these extend it.', '') +
      cats.map(function (c) {
        return '<h2 style="margin:24px 0 10px">' + c + '</h2><div class="card"><ul class="list">' + NX.integrations.filter(function (i) { return i.cat === c; }).map(function (i) {
          var ch = NX.channels[i.id];
          var logo = ch ? '<span class="chan-ico" style="width:32px;height:32px;border-radius:8px;font-size:13px;background:' + ch.color + '">' + ch.short + '</span>' : '<span class="ws-logo" style="width:32px;height:32px">' + esc(i.name.slice(0, 2).toUpperCase()) + '</span>';
          return '<li>' + logo + '<div class="grow"><div class="title">' + esc(i.name) + '</div><div class="meta">' + esc(i.detail) + (i.sync ? ', last sync ' + esc(i.sync) : '') + '</div></div>' + UI.status(i.status) +
            (i.status === 'connected' ? '<button class="btn sm" data-act="int-off" data-id="' + i.id + '">Disconnect</button>' : i.status === 'error' ? '<button class="btn primary sm" data-act="int-on" data-id="' + i.id + '">Reconnect</button>' : '<button class="btn sm" data-act="int-on" data-id="' + i.id + '">Connect</button>') + '</li>';
        }).join('') + '</ul></div>';
      }).join('') +
      '<div class="callout mt-24">' + icon('key') + '<div>Credentials are encrypted and never shown again after you connect. Instagram and Messenger depend on Meta approving your business account. A problem with one channel does not affect the others.</div></div></div>';
  };
  A.actions['int-on'] = function (el) {
    var i = NX.byId(NX.integrations, el.getAttribute('data-id'));
    if (!i) return;
    UI.modal({ title: (i.status === 'error' ? 'Reconnect ' : 'Connect ') + i.name, ok: 'Continue to ' + i.name.split(' ')[0],
      body: '<p class="muted">You will sign in to ' + esc(i.name.split(' (')[0]) + ' in a new window and choose what Nexora may access. Nexora will be able to:</p><ul class="mt-12" style="padding-left:18px;line-height:1.9">' + (i.cat === 'Communication' ? '<li>Receive messages sent to your business account</li><li>Send replies written by your team or approved agents</li><li>Read delivery and read status</li>' : i.cat === 'Payments' ? '<li>Receive payment confirmations to verify invoices</li><li>Create payment links on invoices</li>' : '<li>Read and write the records you choose to sync</li>') + '</ul>',
      onOk: function () {
        var body = {};
        if (i.id === 'instagram') body.detail = '@example';
        return NXActions.run(function () { return NXApi.mutate('POST', '/integrations/' + i.id + '/connect', body); }, i.name + ' connected', 'Could not connect ' + i.name);
      } });
  };
  A.actions['int-off'] = function (el) {
    var i = NX.byId(NX.integrations, el.getAttribute('data-id'));
    if (!i) return;
    UI.modal({ title: 'Disconnect ' + i.name + '?', body: '<p>' + (i.cat === 'Communication' ? 'New messages from this channel will stop arriving in the inbox. Past conversations stay.' : 'Syncing will stop. Records already in Nexora stay.') + '</p>',
      foot: '<button class="btn" data-close>Keep connected</button><button class="btn danger solid" data-ok>Disconnect</button>', onOk: function () {
        return NXActions.run(function () { return NXApi.mutate('POST', '/integrations/' + i.id + '/disconnect', {}); }, i.name + ' disconnected', 'Could not disconnect ' + i.name);
      } });
  };

  /* ================= Settings ================= */
  A.views.settings = function (r) {
    var tab = r.sub || '';
    var admin = A.isAdmin();
    var tabs = [['', 'Business profile'], ['notifications', 'Notifications'], ['security', 'Sign-in and devices'], ['apps', 'Desktop apps']];
    if (admin) tabs.push(['audit', 'Audit log'], ['data', 'Data and privacy']);
    tabs.push(['appearance', 'Appearance']);
    var b = NX.business, body;
    if (tab === 'notifications') loadPreferences();
    if (tab === 'data') loadRetention();
    if (!tab) {
      body = '<section class="card" style="max-width:820px"><div class="card-body"><div class="form-grid" id="biz">' +
        UI.field({ label: 'Business name', required: true, value: b.name, name: 'name' }) + UI.field({ label: 'Workspace ID', value: b.id, readonly: true, hint: 'Share this with Nexora support if you need help.' }) +
        UI.field({ label: 'Email', type: 'email', required: true, value: b.email, name: 'email' }) + UI.field({ label: 'Phone', required: true, value: b.phone, name: 'phone' }) +
        UI.field({ label: 'Address', required: true, value: b.address, name: 'address', span: true }) +
        UI.field({ label: 'Currency', type: 'select', options: [['GHS', 'Ghana cedi (GHS)'], ['USD', 'US dollar (USD)']], value: b.currency, required: true, name: 'currency' }) +
        UI.field({ label: 'Time zone', type: 'select', options: ['Africa/Accra (GMT+0)', 'Africa/Lagos (GMT+1)'], value: b.timezone, required: true, name: 'timezone' }) +
        UI.field({ label: 'Industry', value: b.industry, name: 'industry' }) + UI.field({ label: 'Tax identification number', value: 'TIN-REDACTED', name: 'tin' }) +
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
      body = '<div class="stack" style="max-width:820px"><section class="card"><div class="card-head"><h2>Password and verification</h2></div><ul class="list"><li><div class="grow"><div class="title">Password</div><div class="meta">Changed 3 months ago</div></div><button class="btn sm" data-act="change-pw">Change password</button></li><li><div class="grow"><div class="title">Two-step verification</div><div class="meta">Code from an authenticator app when signing in on a new device</div></div><span class="badge good">On</span></li></ul></section>' +
        '<section class="card"><div class="card-head"><div><h2>Signed-in devices</h2><div class="sub">Web, Windows and macOS sessions for your account</div></div><button class="btn sm" data-act="signout-others">Sign out other devices</button></div><ul class="list">' +
        NX.sessions.map(function (s) { return '<li>' + icon(s.icon) + '<div class="grow"><div class="title">' + esc(s.device) + (s.current ? ' <span class="badge accent">This device</span>' : '') + '</div><div class="meta">' + esc(s.where) + ', ' + esc(s.when) + '</div></div>' + (s.current ? '' : '<button class="btn ghost sm" data-act="signout-one" data-id="' + esc(s.id) + '">Sign out</button>') + '</li>'; }).join('') + '</ul></section></div>';
    } else if (tab === 'apps') {
      body = '<div class="grid g-3" style="max-width:1000px">' + [['globe', 'Web app', 'Any modern browser', 'Works in current Chrome, Edge, Safari and Firefox.', 'You are here'], ['monitor', 'Windows', 'Version 1.4.2', 'Windows 10 and 11, 64-bit. Updates install automatically.', 'Download for Windows'], ['monitor', 'macOS', 'Version 1.4.2', 'macOS 12 or later, Apple silicon and Intel.', 'Download for macOS']].map(function (x, i) {
        return '<section class="card"><div class="card-body"><div style="color:var(--text-2)">' + icon(x[0], 'i-l') + '</div><h2 class="mt-12">' + x[1] + '</h2><div class="small faint">' + x[2] + '</div><p class="small muted mt-8">' + x[3] + '</p><button class="btn ' + (i ? 'primary' : '') + ' sm mt-16"' + (i ? ' data-act="download-app"' : ' disabled') + '>' + (i ? icon('download', 'i-s') : '') + x[4] + '</button></div></section>';
      }).join('') + '</div><p class="small faint mt-16">All apps connect to the same workspace. A change made on one appears on the others within seconds.</p>';
    } else if (tab === 'audit') {
      var t = A.state.auditType || '';
      var rows2 = NX.audit.filter(function (e) { return !t || e.type === t; });
      body = '<div class="card"><div class="toolbar"><div class="seg" role="group" aria-label="Actor type">' + [['', 'All'], ['Employee', 'Employees'], ['AI agent', 'AI agents'], ['Workflow', 'Workflows'], ['Integration', 'Integrations']].map(function (o) { return '<button data-act="audit-type" data-v="' + o[0] + '" aria-pressed="' + (t === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div><span class="small faint" style="margin-left:auto">' + icon('lock', 'i-s') + ' Read only. Records cannot be edited or deleted.</span></div>' +
        '<div class="table-wrap"><table class="t"><thead><tr><th>Time</th><th>Actor</th><th>Type</th><th>Action</th><th>Record</th><th>Result</th><th>Approval</th></tr></thead><tbody>' +
        rows2.map(function (e) { return '<tr><td class="small muted nowrap num">' + esc(e.when) + '</td><td class="strong">' + esc(e.actor) + '</td><td>' + (e.type === 'AI agent' ? '<span class="badge ai">AI agent</span>' : '<span class="badge outline">' + e.type + '</span>') + '</td><td>' + esc(e.action) + '</td><td class="small">' + esc(e.res) + '</td><td>' + UI.status(e.result) + '</td><td class="small">' + (e.approval ? '<a href="#/agents/approvals">' + e.approval + '</a>' : '<span class="faint">None</span>') + '</td></tr>'; }).join('') +
        '</tbody></table></div><div class="pager"><span>' + rows2.length + ' events. Workspace ' + NX.business.id + '</span><button class="btn sm" data-act="export">' + icon('download', 'i-s') + 'Export</button></div></div>';
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
        '</div><div class="card-foot"><span>Financial records are kept as long as Ghana tax rules require.</span><button class="btn sm primary" data-act="saved">Save</button></div></section>' +
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
    UI.modal({ title: 'Delete a customer\'s personal data', body: UI.field({ label: 'Customer', type: 'select', required: true, placeholder: 'Choose a customer', name: 'customer', options: NX.customers.map(function (c) { return [c.id, c.name]; }) }) +
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
