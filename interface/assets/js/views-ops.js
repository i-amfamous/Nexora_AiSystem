/* Views: sales, orders, inventory, finance, employees, tasks. */
(function () {
  var A = App, esc = UI.esc, money = UI.money;

  /* Defensive helpers: bootstrap may not have populated every collection yet. */
  function nm(row, fallback) { return row && row.name ? row.name : (fallback || 'Unknown'); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function channelName(key) {
    var ch = NX.channels && NX.channels[key];
    return ch && ch.name ? ch.name : 'Unknown channel';
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function futureISO(days) { var d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
  var head = function (title, sub, actions) {
    return '<div class="page-head"><div><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div><div class="actions">' + (actions || '') + '</div></div>';
  };
  var tabBar = function (key, tabs, cur) {
    return '<div class="tabs" role="tablist">' + tabs.map(function (t) {
      return '<a class="tab" role="tab" href="#/' + key + (t[0] ? '/' + t[0] : '') + '" aria-selected="' + (cur === t[0]) + '">' + t[1] + (t[2] != null ? '<span class="count">' + t[2] + '</span>' : '') + '</a>';
    }).join('') + '</div>';
  };
  A.tabBar = tabBar; A.head = head;

  /* ================= Sales pipeline ================= */
  A.views.sales = function (r) {
    var view = r.sub || 'pipeline';
    var open = arr(NX.leads).filter(function (l) { return l && l.stage !== 'Won' && l.stage !== 'Lost'; });
    var pipeVal = open.reduce(function (a, l) { return a + (Number(l.value) || 0); }, 0);
    var won = arr(NX.leads).filter(function (l) { return l && l.stage === 'Won'; });
    var wonVal = won.reduce(function (a, l) { return a + (Number(l.value) || 0); }, 0);
    var body;
    if (view === 'pipeline') {
      body = '<div class="board" id="board">' + arr(NX.stages).map(function (s) {
        var ls = arr(NX.leads).filter(function (l) { return l && l.stage === s; });
        var sum = ls.reduce(function (a, l) { return a + (Number(l.value) || 0); }, 0);
        return '<section class="col" data-stage="' + s + '" aria-label="' + s + '"><div class="col-head">' + s + ' <span class="count">' + ls.length + '</span><span class="sum">' + money(sum, { dp: 0 }) + '</span></div><div class="col-body">' +
          ls.map(function (l) {
            var o = NX.employee(l.owner);
            return '<article class="kcard" draggable="true" data-lead="' + l.id + '" tabindex="0" data-act="open-lead" data-id="' + l.id + '"><div class="k-title">' + esc(nm(l)) + '</div><div class="k-sub">' + esc(l.contact || '') + ', via ' + esc(l.source || '') + '</div>' +
              (l.ai ? '<div class="mt-8"><span class="badge ai">' + icon('sparkle', 'i-s') + 'Flagged by Sales Agent</span></div>' : '') +
              '<div class="k-foot"><span class="num" style="color:var(--text);font-weight:600">' + money(l.value || 0, { dp: 0 }) + '</span><span class="row" style="gap:6px">' + UI.avatar(nm(o), 's') + '</span></div>' +
              '<div class="small faint mt-8 row" style="gap:5px">' + icon('calendar', 'i-s') + esc(l.next || '') + '</div></article>';
          }).join('') + '</div></section>';
      }).join('') + '</div><p class="small faint mt-12">Drag a card to change its stage. Stage changes are recorded against your name.</p>';
    } else if (view === 'activities') {
      var acts = arr(NX.salesActivities).map(function (a) {
        var by = NX.employee(a.by);
        var lead = a.leadName || (a.leadId ? nm(NX.byId(NX.leads, a.leadId), '') : (a.lead || ''));
        return { when: a.when || a.at || '', type: a.type || '', lead: lead, summary: a.summary || '', by: nm(by, 'Unknown') };
      });
      body = '<div class="card"><table class="t"><thead><tr><th>When</th><th>Type</th><th>Lead</th><th>Summary</th><th>By</th></tr></thead><tbody>' +
        (acts.length ? acts.map(function (a) { return '<tr><td class="small nowrap muted">' + esc(a.when) + '</td><td><span class="badge outline">' + esc(a.type) + '</span></td><td class="strong">' + esc(a.lead) + '</td><td class="muted">' + esc(a.summary) + '</td><td><div class="cell-2">' + UI.avatar(a.by, 's') + '<span class="small">' + esc(String(a.by).split(' ')[0]) + '</span></div></td></tr>'; }).join('') : '<tr><td colspan="5">' + UI.empty('No follow-up activity yet', 'Logged follow-ups appear here once they are recorded.') + '</td></tr>') +
        '</tbody></table></div>';
    } else {
      var byRep = {};
      arr(NX.orders).forEach(function (o) { if (o) byRep[o.by] = (byRep[o.by] || 0) + NX.orderTotal(o); });
      var repRows = Object.keys(byRep).map(function (k) { return [nm(NX.employee(k), k || 'Unknown'), byRep[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
      var channelRows = arr(NX.salesByChannel).slice(0, 5).map(function (x) { return [x[0], Number(x[1]) || 0]; });
      body = '<div class="grid g-2"><section class="card"><div class="card-head"><h2>Sales by employee</h2><span class="sub">Recorded orders</span></div><div class="card-body">' +
        (repRows.length ? UI.hbars(repRows, function (v) { return money(v, { dp: 0 }); }) : UI.empty('No sales by employee yet', 'Order totals by employee appear here once orders are recorded.')) + '</div></section>' +
        '<section class="card"><div class="card-head"><h2>Sales by channel</h2><span class="sub">Recorded orders</span></div><div class="card-body">' +
        (channelRows.length ? UI.hbars(channelRows, function (v) { return money(v, { dp: 0 }); }) : UI.empty('No sales by channel yet', 'Channel totals appear here once orders are recorded.')) + '</div></section></div>';
    }
    return '<div class="page">' + head('Sales', open.length + ' open leads worth ' + money(pipeVal, { dp: 0 }) + (won.length ? '. Won: ' + money(wonVal, { dp: 0 }) : '') + '.', '<button class="btn primary" data-act="new-lead">' + icon('plus', 'i-s') + 'New lead</button>') +
      tabBar('sales', [['', 'Pipeline'], ['activities', 'Follow-up activity'], ['reports', 'Sales reports']], r.sub) + body + '</div>';
  };
  A.mounts.sales = function (c) {
    var board = c.querySelector('#board'); if (!board) return;
    var dragging = null;
    board.addEventListener('dragstart', function (e) { var k = e.target.closest('.kcard'); if (!k) return; dragging = k.getAttribute('data-lead'); k.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragging); });
    board.addEventListener('dragend', function (e) { var k = e.target.closest('.kcard'); if (k) k.classList.remove('dragging'); board.querySelectorAll('.col').forEach(function (x) { x.classList.remove('drop'); }); });
    board.addEventListener('dragover', function (e) { var col = e.target.closest('.col'); if (!col) return; e.preventDefault(); board.querySelectorAll('.col').forEach(function (x) { x.classList.toggle('drop', x === col); }); });
    board.addEventListener('drop', function (e) {
      var col = e.target.closest('.col'); if (!col || !dragging) return; e.preventDefault();
      var l = NX.byId(NX.leads, dragging), to = col.getAttribute('data-stage');
      if (!l || l.stage === to) return;
      void NXActions.run(function () { return NXApi.mutate('PATCH', '/leads/' + l.id, { stage: to }); }, l.name + ' moved to ' + to);
      dragging = null;
    });
  };
  A.actions['open-lead'] = function (el) {
    var l = NX.byId(NX.leads, el.getAttribute('data-id'));
    if (!l) return;
    UI.drawer({ title: nm(l), head: '<h2>' + esc(nm(l)) + '</h2><div class="small muted">' + esc(l.contact || '') + ', source ' + esc(l.source || '') + '</div>',
      body: '<div class="form-grid">' +
        UI.field({ label: 'Stage', type: 'select', options: NX.stages || [], value: l.stage, name: 'stage', required: true }) +
        UI.field({ label: 'Owner', type: 'select', options: arr(NX.employees).filter(function (e) { return e && (e.role === 'sales' || e.role === 'manager'); }).map(function (e) { return [e.id, nm(e)]; }), value: l.owner, name: 'owner', required: true }) +
        UI.field({ label: 'Estimated value (GHS)', type: 'number', value: l.value, name: 'value', required: true, min: 0 }) +
        UI.field({ label: 'Next step', value: l.next, name: 'next' }) + '</div>' +
        '<h3 style="margin:20px 0 8px">Log a follow-up</h3><div class="form-grid">' + UI.field({ label: 'Type', type: 'select', options: ['Call', 'Meeting', 'WhatsApp', 'Email', 'Visit'], value: 'Call', required: true, name: 'actType' }) + UI.field({ label: 'Date', type: 'date', value: todayISO(), required: true, name: 'actDate' }) + UI.field({ label: 'Summary', type: 'textarea', span: true, placeholder: 'What was agreed?', name: 'actSummary' }) + '</div>' +
        (l.ai ? '<div class="callout ai mt-16">' + icon('sparkle') + '<div>Sales Agent flagged this lead. Review the lead details and record the agreed next step.</div></div>' : ''),
      foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" id="save-lead">Save lead</button>',
      onMount: function (d) {
        d.querySelector('#save-lead').addEventListener('click', function () {
          if (!UI.validate(d)) return;
          var f = A.readForm(d), summary = (f.actSummary || '').trim();
          void NXActions.run(async function () {
            await NXApi.mutate('PATCH', '/leads/' + l.id, { stage: f.stage, owner: f.owner, value: +f.value, next: f.next });
            if (summary) {
              await NXApi.mutate('POST', '/sales-activities', {
                leadId: l.id, type: f.actType, summary: summary, by: A.me.emp,
                at: f.actDate ? new Date(f.actDate + 'T12:00:00').toISOString() : new Date().toISOString()
              });
            }
          }, summary ? 'Lead saved and follow-up logged' : 'Lead saved').then(function (result) { if (result) UI.closeAll(); return result; });
        });
      } });
  };
  A.actions['new-lead'] = function () {
    UI.modal({ title: 'New lead', ok: 'Create lead', body: '<div class="form-grid">' +
      UI.field({ label: 'Lead name', required: true, name: 'name', placeholder: 'Organisation or opportunity', span: true }) +
      UI.field({ label: 'Contact person', required: true, name: 'contact' }) +
      UI.field({ label: 'Source', type: 'select', options: ['WhatsApp', 'Email', 'Website chat', 'Referral', 'Walk-in', 'Instagram', 'Telegram'], name: 'source', required: true }) +
      UI.field({ label: 'Estimated value (GHS)', type: 'number', name: 'value', required: true, min: 0, err: 'Enter a value of 0 or more.' }) +
      UI.field({ label: 'Owner', type: 'select', options: arr(NX.employees).filter(function (e) { return e && (e.role === 'sales' || e.role === 'manager'); }).map(function (e) { return [e.id, nm(e)]; }), value: A.me && A.me.emp, name: 'owner', required: true }) + '</div>',
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var f = A.readForm(m);
        var body = { name: f.name, contact: f.contact, source: f.source, value: +f.value, stage: 'New', owner: f.owner, next: 'First contact' };
        return NXActions.run(function () { return NXApi.mutate('POST', '/leads', body); }, 'Lead created').then(function (result) { if (result) A.go('#/sales'); return result; });
      } });
  };

  /* ================= Orders ================= */
  A.views.orders = function (r) {
    var st = A.state.orderStatus || '';
    var statuses = ['Draft', 'Confirmed', 'Processing', 'Out for delivery', 'Delivered', 'Cancelled'];
    var rows = arr(NX.orders).filter(function (o) { return o && (!st || o.status === st); });
    var canCreate = ['finance', 'inventory'].indexOf(A.me.role) === -1;
    return '<div class="page">' + head('Orders', 'Totals are calculated by the server from current prices and recorded against the employee who created the order.', canCreate ? '<button class="btn" data-act="export">' + icon('download', 'i-s') + 'Export</button><button class="btn primary" data-act="new-order">' + icon('plus', 'i-s') + 'New order</button>' : '') +
      '<div class="card"><div class="toolbar"><div class="seg" role="group" aria-label="Filter by status"><button data-act="order-st" data-v="" aria-pressed="' + (!st) + '">All</button>' + statuses.map(function (s) { return '<button data-act="order-st" data-v="' + s + '" aria-pressed="' + (st === s) + '">' + s + '</button>'; }).join('') + '</div></div>' +
      '<div class="table-wrap"><table class="t"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Source</th><th>Status</th><th>Payment</th><th class="num">Total</th><th>Created by</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (o) {
        var c = NX.customer(o.customer) || {}, by = NX.employee(o.by);
        var byName = nm(by, 'Unknown');
        var items = arr(o.items);
        return '<tr class="click" data-act="open-order" data-id="' + o.id + '" tabindex="0"><td><div class="strong">' + o.id + '</div><div class="small faint">' + esc(o.date || '') + '</div></td><td>' + esc(nm(c)) + '<div class="small faint">' + esc(c.company || '') + '</div></td>' +
          '<td class="small muted">' + items.length + ' item' + (items.length > 1 ? 's' : '') + '</td><td>' + UI.chan(o.channel, true) + '</td><td>' + UI.status(o.status) + (o.aiDraft ? ' <span class="badge ai">AI draft</span>' : '') + '</td><td>' + UI.status(o.pay) + '</td><td class="num strong">' + money(NX.orderTotal(o)) + '</td>' +
          '<td><div class="cell-2">' + UI.avatar(byName, 's') + '<span class="small">' + esc(String(byName).split(' ')[0]) + '</span></div></td></tr>';
      }).join('') : '<tr><td colspan="8">' + UI.empty('No ' + (st || '').toLowerCase() + ' orders', 'Orders appear here as soon as they reach this status.') + '</td></tr>') +
      '</tbody></table></div><div class="pager"><span>' + rows.length + ' orders</span><div class="row"><button class="btn sm" disabled>Previous</button><button class="btn sm" disabled>Next</button></div></div></div></div>';
  };
  A.mounts.orders = function (c, r) { if (r.sub === 'o' && r.id) openOrder(r.id); };
  A.actions['order-st'] = function (el) { A.state.orderStatus = el.getAttribute('data-v'); A.render(); };
  A.actions['open-order'] = function (el) { openOrder(el.getAttribute('data-id')); };
  function openOrder(id) {
    var o = NX.byId(NX.orders, id); if (!o) return;
    var c = NX.customer(o.customer) || {}, total = NX.orderTotal(o);
    var byName = nm(NX.employee(o.by));
    var flow = ['Draft', 'Confirmed', 'Processing', 'Out for delivery', 'Delivered'];
    var next = flow[flow.indexOf(o.status) + 1];
    UI.drawer({ title: o.id,
      head: '<div class="row" style="gap:8px"><h2>' + o.id + '</h2>' + UI.status(o.status) + UI.status(o.pay) + '</div><div class="small muted mt-8">' + esc(nm(c)) + (c.company ? ', ' + esc(c.company) : '') + '. Created ' + esc(o.date || '') + ' by ' + esc(byName) + '</div>',
      body: (o.aiDraft ? '<div class="callout ai" style="margin-bottom:16px">' + icon('sparkle') + '<div>Prepared by an AI agent. It is a draft until a person confirms it. Confirmation is waiting in approvals.</div></div>' : '') +
        '<div class="card"><table class="t"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead><tbody>' +
        arr(o.items).map(function (it) { var p = NX.product(it[0]) || {}; var price = Number(p.price) || 0; var qty = Number(it[1]) || 0; return '<tr><td>' + esc(nm(p)) + '<div class="small faint">' + esc(p.sku || '') + '</div></td><td class="num">' + qty + '</td><td class="num">' + money(price) + '</td><td class="num">' + money(price * qty) + '</td></tr>'; }).join('') +
        '<tr><td colspan="3" class="strong">Total</td><td class="num strong">' + money(total) + '</td></tr></tbody></table></div>' +
        '<h3 style="margin:20px 0 10px">History</h3><ul class="timeline">' +
          (o.status !== 'Draft' ? '<li class="good"><div>Status changed to ' + esc(o.status) + '</div><div class="when">' + esc(o.date || '') + ', ' + esc(byName) + '</div></li>' : '') +
          (o.pay === 'Paid' ? '<li class="good"><div>Payment recorded</div><div class="when">' + esc(o.date || '') + '</div></li>' : '') +
          '<li class="' + (o.aiDraft ? 'ai' : '') + '"><div>Order created from ' + channelName(o.channel) + '</div><div class="when">' + esc(o.date || '') + ', ' + (o.aiDraft ? 'AI agent' : esc(byName)) + '</div></li></ul>',
      foot: (o.status !== 'Cancelled' && o.status !== 'Delivered' ? '<button class="btn danger" data-act="order-cancel" data-id="' + o.id + '">Cancel order</button><span style="flex:1"></span>' : '') +
        (A.can('finance') ? '<button class="btn" data-act="new-invoice" data-order="' + o.id + '">' + icon('invoice', 'i-s') + 'Create invoice</button>' : '') +
        (next && !o.aiDraft ? '<button class="btn primary" data-act="order-next" data-id="' + o.id + '">Mark as ' + next.toLowerCase() + '</button>' : '') +
        (o.aiDraft && A.can('agents') ? '<a class="btn primary" href="#/agents/approvals">Review approval</a>' : '')
    });
  }
  A.actions['order-next'] = function (el) {
    var o = NX.byId(NX.orders, el.getAttribute('data-id')); if (!o) return;
    var flow = ['Draft', 'Confirmed', 'Processing', 'Out for delivery', 'Delivered'];
    var next = flow[flow.indexOf(o.status) + 1]; if (!next) return;
    return NXActions.run(function () { return NXApi.mutate('POST', '/orders/' + o.id + '/status', { status: next }); }, o.id + ' marked as ' + next.toLowerCase()).then(function (result) { if (result) UI.closeAll(); return result; });
  };
  A.actions['order-cancel'] = function (el) {
    var o = NX.byId(NX.orders, el.getAttribute('data-id')); if (!o) return;
    UI.modal({ title: 'Cancel ' + o.id + '?', ok: 'Cancel order', body: '<p>Reserved stock returns to inventory. If the customer has paid, record the refund in Finance, where it will need approval.</p>' + '<div class="mt-16">' + UI.field({ label: 'Reason', type: 'textarea', required: true, name: 'reason', err: 'Give a reason so your team understands why.' }) + '</div>',
      foot: '<button class="btn" data-close>Keep order</button><button class="btn danger solid" data-ok>Cancel order</button>',
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var reason = m.querySelector('[name=reason]').value.trim();
        return NXActions.run(function () { return NXApi.mutate('POST', '/orders/' + o.id + '/cancel', { reason: reason }); }, o.id + ' cancelled');
      } });
  };
  A.actions['new-order'] = function (el) {
    var cust = el && el.getAttribute ? el.getAttribute('data-customer') : '';
    var lines = [{ p: '', q: 1 }];
    var draw = function (m) {
      var tb = m.querySelector('#lines'), t = 0, stockWarn = '';
      tb.innerHTML = lines.map(function (l, i) {
        var p = l.p ? NX.product(l.p) : null; var amt = p ? p.price * l.q : 0; t += amt;
        if (p && l.q > p.stock) stockWarn = p.name + ' has only ' + p.stock + ' in stock. The order can be saved, but it will be held until stock arrives.';
        return '<tr><td><select class="input input-sm" data-line="' + i + '" data-k="p" aria-label="Product"><option value="">Choose a product</option>' + arr(NX.products).map(function (pp) { return '<option value="' + pp.id + '"' + (pp.id === l.p ? ' selected' : '') + (pp.stock === 0 ? ' disabled' : '') + '>' + esc(nm(pp)) + (pp.stock === 0 ? ' (out of stock)' : '') + '</option>'; }).join('') + '</select></td>' +
          '<td style="width:90px"><input class="input input-sm" type="number" min="1" value="' + l.q + '" data-line="' + i + '" data-k="q" aria-label="Quantity"></td><td class="num" style="width:110px">' + (p ? money(p.price) : '') + '</td><td class="num" style="width:120px">' + money(amt) + '</td>' +
          '<td style="width:36px">' + (lines.length > 1 ? '<button class="icon-btn" data-rm="' + i + '" aria-label="Remove line">' + icon('x', 'i-s') + '</button>' : '') + '</td></tr>';
      }).join('');
      m.querySelector('#ototal').textContent = money(t);
      var w = m.querySelector('#stockwarn'); w.style.display = stockWarn ? '' : 'none'; w.querySelector('span').textContent = stockWarn;
    };
    UI.modal({ title: 'New order', wide: true, ok: 'Create order',
      body: '<div class="form-grid">' + UI.field({ label: 'Customer', type: 'select', required: true, placeholder: 'Choose a customer', options: arr(NX.customers).map(function (c) { return [c.id, nm(c) + (c.company ? ', ' + c.company : '')]; }), value: cust, name: 'customer' }) +
        UI.field({ label: 'Source', type: 'select', options: [['whatsapp', 'WhatsApp'], ['email', 'Email'], ['webchat', 'Website chat'], ['telegram', 'Telegram'], ['instagram', 'Instagram']], value: 'whatsapp', name: 'channel', required: true }) + '</div>' +
        '<div class="card mt-16"><table class="t"><thead><tr><th>Product</th><th>Qty</th><th class="num">Price</th><th class="num">Amount</th><th></th></tr></thead><tbody id="lines"></tbody></table>' +
        '<div class="card-foot"><button class="btn ghost sm" id="addline">' + icon('plus', 'i-s') + 'Add item</button><span>Estimated total <b class="num" id="ototal" style="color:var(--text);margin-left:8px"></b></span></div></div>' +
        '<div class="callout warn mt-12" id="stockwarn" style="display:none">' + icon('alert') + '<span></span></div>' +
        '<p class="hint mt-12">The final total is calculated by the server when the order is saved, using current prices and any approved discounts.</p>' +
        '<p class="small mt-8" id="lineerr" style="color:var(--bad);display:none">Add at least one product to the order.</p>',
      onMount: function (m) {
        draw(m);
        m.addEventListener('change', function (e) { var i = e.target.getAttribute('data-line'); if (i == null) return; var k = e.target.getAttribute('data-k'); lines[+i][k] = k === 'q' ? Math.max(1, parseInt(e.target.value, 10) || 1) : e.target.value; draw(m); });
        m.addEventListener('click', function (e) {
          if (e.target.closest('#addline')) { lines.push({ p: '', q: 1 }); draw(m); }
          var rm = e.target.closest('[data-rm]'); if (rm) { lines.splice(+rm.getAttribute('data-rm'), 1); draw(m); }
        });
      },
      onOk: function (m) {
        var ok = UI.validate(m);
        var valid = lines.filter(function (l) { return l.p; });
        m.querySelector('#lineerr').style.display = valid.length ? 'none' : '';
        if (!ok || !valid.length) return false;
        var f = A.readForm(m);
        var body = { customer: f.customer, channel: f.channel, currency: (NX.business && NX.business.currency) || 'GHS', items: valid.map(function (l) { return [l.p, l.q]; }) };
        return NXActions.run(function () { return NXApi.mutate('POST', '/orders', body); }, 'Order created').then(function (result) {
          if (result) A.go('#/orders');
          return result;
        });
      } });
  };

  /* ================= Inventory ================= */
  A.views.inventory = function (r) {
    var tab = r.sub === 'p' ? '' : r.sub;
    var low = arr(NX.products).filter(function (p) { return p && p.stock <= p.threshold; }).length;
    var canAdjust = A.me && ['owner', 'admin', 'manager', 'inventory'].indexOf(A.me.role) > -1;
    var stockValue = arr(NX.products).reduce(function (a, p) { return a + (Number(p.cost) || 0) * (Number(p.stock) || 0); }, 0);
    var body;
    if (!tab) {
      var q = (A.state.prodQ || '').toLowerCase(), f = A.state.prodF || '';
      var rows = arr(NX.products).filter(function (p) { return p && (!q || (nm(p, '') + ' ' + (p.sku || '')).toLowerCase().indexOf(q) > -1) && (!f || (f === 'low' ? p.stock <= p.threshold && p.stock > 0 : f === 'out' ? p.stock === 0 : p.cat === f)); });
      var cats = [];
      arr(NX.products).forEach(function (p) { if (p && p.cat && cats.indexOf(p.cat) === -1) cats.push(p.cat); });
      body = '<div class="card"><div class="toolbar"><div class="input-icon" style="width:280px;max-width:100%">' + icon('search', 'i-s') + '<input class="input input-sm" placeholder="Search product or SKU" data-input="prod-q" value="' + esc(A.state.prodQ || '') + '" aria-label="Search products"></div>' +
        '<select class="input input-sm" style="width:auto" data-change="prod-f" aria-label="Filter"><option value="">All products</option><option value="low"' + (f === 'low' ? ' selected' : '') + '>Low stock</option><option value="out"' + (f === 'out' ? ' selected' : '') + '>Out of stock</option>' + cats.map(function (c) { return '<option' + (f === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
        '<div class="table-wrap"><table class="t"><thead><tr><th>Product</th><th>Category</th><th class="num">Price</th><th class="num">In stock</th><th>Level</th><th class="num">Sold, 30 days</th><th>Supplier</th>' + (canAdjust ? '<th></th>' : '') + '</tr></thead><tbody>' +
        rows.map(function (p) {
          var st = p.stock === 0 ? '<span class="badge bad">Out of stock</span>' : p.stock <= p.threshold ? '<span class="badge warn">Low</span>' : '<span class="badge good">In stock</span>';
          return '<tr><td><div class="strong">' + esc(nm(p)) + '</div><div class="small faint">' + esc(p.sku || '') + '</div></td><td class="muted">' + esc(p.cat || '') + '</td><td class="num">' + money(p.price || 0) + '</td><td class="num strong">' + (p.stock || 0) + '</td>' +
            '<td>' + st + '<div class="small faint mt-8" style="margin-top:2px">Alert at ' + (p.threshold || 0) + '</div></td><td class="num">' + (p.sold30 || 0) + '</td><td class="small">' + esc(nm(NX.supplier(p.supplier), 'No supplier')) + '</td>' +
            (canAdjust ? '<td><button class="btn sm" data-act="adjust" data-id="' + p.id + '">Adjust</button></td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div></div>';
    } else if (tab === 'movements') {
      body = '<div class="card"><table class="t"><thead><tr><th>When</th><th>Product</th><th>Type</th><th class="num">Change</th><th class="num">Balance after</th><th>Reference</th><th>By</th></tr></thead><tbody>' +
        (arr(NX.movements).length ? arr(NX.movements).map(function (m) { var e = NX.employee(m.by); return '<tr><td class="small muted nowrap">' + esc(m.when || '') + '</td><td class="strong">' + esc(nm(NX.product(m.product))) + '</td><td><span class="badge outline">' + esc(m.type || '') + '</span></td><td class="num ' + (m.qty > 0 ? 'up' : 'down') + '">' + (m.qty > 0 ? '+' : '') + (m.qty || 0) + '</td><td class="num">' + (m.after || 0) + '</td><td class="small">' + esc(m.ref || '') + '</td><td class="small">' + esc(nm(e)) + '</td></tr>'; }).join('') : '<tr><td colspan="7">' + UI.empty('No stock movements yet', 'Adjustments appear here once stock is recorded.') + '</td></tr>') +
        '</tbody></table></div>';
    } else if (tab === 'suppliers') {
      body = '<div class="card"><table class="t"><thead><tr><th>Supplier</th><th>Contact</th><th>Lead time</th><th>Terms</th><th class="num">Products</th><th class="num">Open requests</th></tr></thead><tbody>' +
        (arr(NX.suppliers).length ? arr(NX.suppliers).map(function (s) { return '<tr><td class="strong">' + esc(nm(s)) + '</td><td>' + esc(s.contact || '') + '<div class="small faint">' + esc(s.phone || '') + ', ' + esc(s.email || '') + '</div></td><td>' + esc(s.lead || '') + '</td><td>' + esc(s.terms || '') + '</td><td class="num">' + arr(NX.products).filter(function (p) { return p && p.supplier === s.id; }).length + '</td><td class="num">' + (s.open || 0) + '</td></tr>'; }).join('') : '<tr><td colspan="6">' + UI.empty('No suppliers yet', 'Suppliers appear here once they are added.') + '</td></tr>') +
        '</tbody></table></div>';
    } else {
      body = '<div class="card"><table class="t"><thead><tr><th>Request</th><th>Supplier</th><th>Items</th><th class="num">Total</th><th>Requested by</th><th>Status</th><th></th></tr></thead><tbody>' +
        (arr(NX.purchaseRequests).length ? arr(NX.purchaseRequests).map(function (p) { return '<tr><td class="strong">' + p.id + '<div class="small faint">' + esc(p.date || '') + '</div></td><td>' + esc(nm(NX.supplier(p.supplier), 'No supplier')) + '</td><td class="small">' + esc(p.items || '') + '</td><td class="num">' + money(p.total || 0) + '</td><td>' + (p.byType === 'ai' ? '<span class="badge ai">' + icon('sparkle', 'i-s') + esc(p.by || 'AI agent') + '</span>' : esc(p.by || '')) + '</td><td>' + UI.status(p.status) + '</td><td>' + (p.status === 'Pending approval' && A.can('agents') ? '<a class="btn sm" href="#/agents/approvals">Review</a>' : '') + '</td></tr>'; }).join('') : '<tr><td colspan="7">' + UI.empty('No purchase requests yet', 'Requests appear here once they are submitted.') + '</td></tr>') +
        '</tbody></table></div>';
    }
    return '<div class="page">' + head('Products and inventory', NX.products.length + ' products. Stock value at cost ' + money(stockValue, { dp: 0 }) + '.', canAdjust ? (tab === 'requests' ? '<button class="btn primary" data-act="new-pr">' + icon('plus', 'i-s') + 'New purchase request</button>' : '<button class="btn primary" data-act="new-product">' + icon('plus', 'i-s') + 'New product</button>') : '') +
      (low ? '<div class="callout warn" style="margin-bottom:16px">' + icon('alert') + '<div style="flex:1"><b>' + low + ' products at or below their alert level.</b> Review stock before it runs out.</div><button class="btn sm" data-act="prod-low">Show low stock</button></div>' : '') +
      tabBar('inventory', [['', 'Products', NX.products.length], ['movements', 'Stock movements'], ['suppliers', 'Suppliers', NX.suppliers.length], ['requests', 'Purchase requests', NX.purchaseRequests.length]], tab) + body + '</div>';
  };
  A.mounts.inventory = function (c, r) { if (r.sub === 'p' && r.id) { var b = c.querySelector('[data-act="adjust"][data-id="' + r.id + '"]'); if (b) A.actions.adjust(b); } };
  A.actions['prod-q'] = function (el) { A.state.prodQ = el.value; var p = el.selectionStart; A.render(); var n = document.querySelector('[data-input="prod-q"]'); n.focus(); n.setSelectionRange(p, p); };
  A.actions['prod-f'] = function (el) { A.state.prodF = el.value; A.render(); };
  A.actions['prod-low'] = function () { A.state.prodF = 'low'; A.go('#/inventory'); };
  A.actions.adjust = function (el) {
    var p = NX.product(el.getAttribute('data-id'));
    if (!p) return;
    UI.modal({ title: 'Adjust stock: ' + nm(p), ok: 'Record movement',
      body: '<p class="muted" style="margin-bottom:14px">Currently <b class="num" style="color:var(--text)">' + p.stock + '</b> in stock. Every adjustment is recorded with your name and reason.</p><div class="form-grid">' +
        UI.field({ label: 'Movement', type: 'select', options: ['Received from supplier', 'Return from customer', 'Damaged or lost', 'Stock count correction'], name: 'type', required: true }) +
        UI.field({ label: 'Quantity', type: 'number', name: 'qty', required: true, min: 1, err: 'Enter a quantity of 1 or more.' }) +
        UI.field({ label: 'Alert when stock falls to', type: 'number', name: 'thr', value: p.threshold, required: true, min: 0 }) +
        UI.field({ label: 'Reference or reason', name: 'ref', required: true, placeholder: 'PR number, order or note' }) + '</div>' +
        '<p class="small mt-12" id="negerr" style="color:var(--bad);display:none">This would take stock below zero. Check the quantity or do a stock count correction.</p>',
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var f = A.readForm(m), q = +f.qty, neg = f.type === 'Damaged or lost';
        if (neg && q > p.stock) { m.querySelector('#negerr').style.display = ''; return false; }
        var delta = neg ? -q : q;
        return NXActions.run(async function () {
          await NXApi.mutate('POST', '/products/' + p.id + '/adjust', { delta: delta, reason: f.ref, reference: f.ref });
          await NXApi.mutate('PATCH', '/products/' + p.id, { threshold: +f.thr, thr: +f.thr });
        }, 'Stock updated for ' + nm(p));
      } });
  };
  A.actions['new-product'] = function () {
    UI.modal({ title: 'New product', ok: 'Create product', body: '<div class="form-grid">' +
      UI.field({ label: 'Product name', required: true, name: 'name', span: true }) + UI.field({ label: 'SKU', required: true, name: 'sku', placeholder: 'SKU' }) +
      UI.field({ label: 'Category', type: 'select', options: ['Furniture', 'Stationery', 'Electronics', 'Appliances'], name: 'cat', required: true }) +
      UI.field({ label: 'Selling price (GHS)', type: 'number', required: true, min: 0, name: 'price' }) + UI.field({ label: 'Cost price (GHS)', type: 'number', min: 0, name: 'cost' }) +
      UI.field({ label: 'Opening stock', type: 'number', required: true, min: 0, name: 'stock', value: '0' }) + UI.field({ label: 'Low-stock alert at', type: 'number', required: true, min: 0, name: 'thr', value: '5' }) +
      UI.field({ label: 'Supplier', type: 'select', options: arr(NX.suppliers).map(function (s) { return [s.id, nm(s)]; }), name: 'sup', required: true }) + UI.field({ label: 'Description', type: 'textarea', name: 'desc', span: true }) + '</div>',
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var f = A.readForm(m);
        var body = { sku: f.sku, name: f.name, cat: f.cat, category: f.cat, price: +f.price, cost: +f.cost || 0, stock: +f.stock, threshold: +f.thr, thr: +f.thr, supplier: f.sup, sup: f.sup, description: f.desc, desc: f.desc };
        return NXActions.run(function () { return NXApi.mutate('POST', '/products', body); }, 'Product created').then(function (result) { if (result) A.go('#/inventory'); return result; });
      } });
  };
  A.actions['new-pr'] = function () {
    UI.modal({ title: 'New purchase request', ok: 'Submit for approval', body: '<div class="form-grid">' +
      UI.field({ label: 'Supplier', type: 'select', options: arr(NX.suppliers).map(function (s) { return [s.id, nm(s)]; }), name: 'sup', required: true }) +
      UI.field({ label: 'Estimated total', type: 'number', min: 1, required: true, name: 'total' }) +
      UI.field({ label: 'Items', type: 'textarea', required: true, name: 'items', span: true, placeholder: 'Product and quantity, one per line' }) + '</div><p class="hint mt-12">Larger requests need a department manager to approve.</p>',
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var f = A.readForm(m);
        var body = { supplier: f.sup, sup: f.sup, items: f.items.split('\n').join(', '), total: +f.total, status: 'Pending approval', by: nm(NX.employee(A.me && A.me.emp)), byType: 'human', date: todayISO() };
        return NXActions.run(function () { return NXApi.mutate('POST', '/purchase-requests', body); }, 'Purchase request submitted for approval').then(function (result) { if (result) A.go('#/inventory/requests'); return result; });
      } });
  };

  /* ================= Finance ================= */
  A.views.finance = function (r) {
    var tab = r.sub || '';
    var invoices = arr(NX.invoices), payments = arr(NX.payments), expenses = arr(NX.expenses);
    var outstanding = invoices.reduce(function (a, v) { return a + (Number(v.total) || 0) - (Number(v.paid) || 0); }, 0);
    var overdue = invoices.filter(function (v) { return v.status === 'Overdue'; });
    var overdueAmt = overdue.reduce(function (a, v) { return a + (Number(v.total) || 0) - (Number(v.paid) || 0); }, 0);
    var received = payments.reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0);
    var unverified = payments.filter(function (p) { return !p.verified; });
    var exp = expenses.reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0);
    var pendingExp = expenses.filter(function (e) { return e.status === 'Pending approval'; }).length;
    var oldest = 0;
    overdue.forEach(function (v) {
      var due = Date.parse(v.due);
      if (!isNaN(due)) oldest = Math.max(oldest, Math.floor((Date.now() - due) / 86400000));
    });
    var body;
    if (!tab) {
      body = '<div class="card"><table class="t"><thead><tr><th>Invoice</th><th>Customer</th><th>Order</th><th>Issued</th><th>Due</th><th class="num">Total</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead><tbody>' +
        (invoices.length ? invoices.map(function (v) { var bal = (Number(v.total) || 0) - (Number(v.paid) || 0); return '<tr><td class="strong nowrap"><a href="#/finance/invoices/' + v.id + '">' + v.id + '</a></td><td>' + esc(nm(NX.customer(v.customer))) + '</td><td class="small nowrap">' + (v.order ? '<a href="#/orders/o/' + v.order + '">' + v.order + '</a>' : '<span class="faint">None</span>') + '</td><td class="small muted nowrap">' + esc(v.issued || '') + '</td><td class="small nowrap ' + (v.status === 'Overdue' ? 'down' : 'muted') + '">' + esc(v.due || '') + '</td><td class="num">' + money(v.total || 0) + '</td><td class="num strong">' + money(bal) + '</td><td>' + UI.status(v.status) + '</td>' +
          '<td class="nowrap">' + (bal > 0 ? '<button class="btn sm" data-act="record-pay" data-id="' + v.id + '">Record payment</button> <button class="btn ghost sm" data-act="remind" data-id="' + v.id + '">Remind</button>' : '') + '</td></tr>'; }).join('') : '<tr><td colspan="9">' + UI.empty('No invoices yet', 'Invoices appear here once they are created.') + '</td></tr>') +
        '</tbody></table></div>';
    } else if (tab === 'payments') {
      body = '<div class="callout info" style="margin-bottom:16px">' + icon('shield') + '<div><b>Verified</b> payments were confirmed by a payment provider. <b>Manually recorded</b> payments were entered by a person and should be checked against the bank statement. AI agents can never mark a payment as received.</div></div>' +
        '<div class="card"><table class="t"><thead><tr><th>Payment</th><th>Customer</th><th>Invoice</th><th>Method</th><th class="num">Amount</th><th>Verification</th><th>Reference</th><th>Recorded by</th></tr></thead><tbody>' +
        (payments.length ? payments.map(function (p) { return '<tr><td class="strong">' + p.id + '<div class="small faint">' + esc(p.when || '') + '</div></td><td>' + esc(nm(NX.customer(p.customer))) + '</td><td class="small">' + esc(p.invoice || '') + '</td><td>' + esc(p.method || '') + '</td><td class="num strong">' + money(p.amount || 0) + '</td>' +
          '<td>' + (p.verified ? '<span class="badge good">' + icon('shield', 'i-s') + 'Verified' + (p.provider ? ' by ' + esc(p.provider) : '') + '</span>' : '<span class="badge warn">' + icon('user', 'i-s') + 'Manually recorded</span>') + '</td><td class="small muted">' + esc(p.ref || '') + '</td><td class="small">' + esc(p.by || '') + '</td></tr>'; }).join('') : '<tr><td colspan="8">' + UI.empty('No payments yet', 'Payments appear here once they are recorded.') + '</td></tr>') +
        '</tbody></table></div>';
    } else if (tab === 'expenses') {
      body = '<div class="card"><table class="t"><thead><tr><th>Expense</th><th>Date</th><th>Category</th><th>Description</th><th class="num">Amount</th><th>Submitted by</th><th>Status</th></tr></thead><tbody>' +
        (expenses.length ? expenses.map(function (e) { return '<tr><td class="strong">' + e.id + '</td><td class="small muted">' + esc(e.date || '') + '</td><td><span class="tag">' + esc(e.cat || '') + '</span></td><td>' + esc(e.desc || '') + '</td><td class="num">' + money(e.amount || 0) + '</td><td class="small">' + esc(nm(NX.employee(e.by))) + '</td><td>' + UI.status(e.status) + '</td></tr>'; }).join('') : '<tr><td colspan="7">' + UI.empty('No expenses yet', 'Expenses appear here once they are recorded.') + '</td></tr>') +
        '</tbody></table></div>';
    } else {
      var monthKeys = [], monthLabels = [], now = new Date();
      for (var m = 5; m >= 0; m--) {
        var dt = new Date(now.getFullYear(), now.getMonth() - m, 1);
        monthKeys.push(dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2));
        monthLabels.push(dt.toLocaleDateString('en', { month: 'short' }));
      }
      var incomeVals = monthKeys.map(function (key) { return payments.filter(function (p) { return String(p.when || p.date || '').slice(0, 7) === key; }).reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0); });
      var expenseVals = monthKeys.map(function (key) { return expenses.filter(function (e) { return String(e.date || '').slice(0, 7) === key; }).reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0); });
      var hasSeries = incomeVals.concat(expenseVals).some(function (v) { return v > 0; });
      var ieChart = hasSeries ? UI.chart('fin-ie', { type: 'bar', height: 240, title: 'Income and expenses', labels: monthLabels, series: [{ name: 'Income', values: incomeVals, color: 'var(--series-1)' }, { name: 'Expenses', values: expenseVals, color: 'var(--series-2)' }], tipFmt: function (v) { return money(v, { dp: 0 }); } }) : UI.empty('No income or expenses yet', 'Recorded payments and expenses appear here by month.');
      var cats = {}; expenses.forEach(function (e) { var k = e.cat || 'Uncategorised'; cats[k] = (cats[k] || 0) + (Number(e.amount) || 0); });
      var catRows = Object.keys(cats).map(function (k) { return [k, cats[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
      var buckets = [{ label: 'Not yet due', count: 0, amount: 0 }, { label: '1 to 15 days overdue', count: 0, amount: 0 }, { label: '16 to 30 days overdue', count: 0, amount: 0 }, { label: 'Over 30 days overdue', count: 0, amount: 0 }];
      invoices.forEach(function (v) {
        var bal = (Number(v.total) || 0) - (Number(v.paid) || 0);
        if (bal <= 0) return;
        var due = Date.parse(v.due), days = isNaN(due) ? 0 : Math.floor((Date.now() - due) / 86400000);
        var i = days <= 0 ? 0 : days <= 15 ? 1 : days <= 30 ? 2 : 3;
        buckets[i].count++; buckets[i].amount += bal;
      });
      body = '<div class="grid g-2"><section class="card"><div class="card-head"><div><h2>Income and expenses</h2><div class="sub">Last 6 months</div></div>' + UI.legend([{ name: 'Income', color: 'var(--series-1)' }, { name: 'Expenses', color: 'var(--series-2)' }]) + '</div><div class="card-body">' + ieChart + '</div></section>' +
        '<section class="card"><div class="card-head"><div><h2>Expenses by category</h2><div class="sub">Recorded expenses</div></div></div><div class="card-body">' + (catRows.length ? UI.hbars(catRows, function (v) { return money(v, { dp: 0 }); }) : UI.empty('No expenses yet', 'Category totals appear here once expenses are recorded.')) + '</div></section></div>' +
        '<section class="card mt-16"><div class="card-head"><div><h2>Outstanding balances by age</h2><div class="sub">Calculated from invoice due dates</div></div></div><table class="t"><thead><tr><th>Age</th><th class="num">Invoices</th><th class="num">Amount</th></tr></thead><tbody>' + buckets.map(function (b) { return '<tr><td>' + b.label + '</td><td class="num">' + b.count + '</td><td class="num">' + money(b.amount) + '</td></tr>'; }).join('') + '</tbody></table></section>';
    }
    return '<div class="page">' + head('Finance', 'Invoices, payments and expenses recorded in Nexora.', '<button class="btn" data-act="new-expense">' + icon('plus', 'i-s') + 'Expense</button><button class="btn primary" data-act="new-invoice">' + icon('plus', 'i-s') + 'New invoice</button>') +
      '<section class="kpis" style="margin-bottom:20px">' +
        '<div class="kpi"><div class="kpi-label">Outstanding</div><div class="kpi-value"><small>GH₵</small>' + money(outstanding, { dp: 0, bare: true }) + '</div><div class="kpi-delta">' + invoices.filter(function (v) { return (Number(v.total) || 0) > (Number(v.paid) || 0); }).length + ' invoices</div></div>' +
        '<div class="kpi"><div class="kpi-label">Overdue</div><div class="kpi-value" style="color:var(--bad)"><small>GH₵</small>' + money(overdueAmt, { dp: 0, bare: true }) + '</div><div class="kpi-delta">' + overdue.length + ' invoices' + (oldest ? ', oldest ' + oldest + ' days' : '') + '</div></div>' +
        '<div class="kpi"><div class="kpi-label">Received</div><div class="kpi-value"><small>GH₵</small>' + money(received, { dp: 0, bare: true }) + '</div><div class="kpi-delta">' + unverified.length + ' manual, not yet verified</div></div>' +
        '<div class="kpi"><div class="kpi-label">Expenses</div><div class="kpi-value"><small>GH₵</small>' + money(exp, { dp: 0, bare: true }) + '</div><div class="kpi-delta">' + pendingExp + ' waiting for approval</div></div></section>' +
      tabBar('finance', [['', 'Invoices', invoices.length], ['payments', 'Payments', payments.length], ['expenses', 'Expenses', expenses.length], ['summary', 'Summary']], tab) + body + '</div>';
  };
  /* Deep links emitted by payment reminders land on a specific invoice. */
  A.mounts.finance = function (c, r) { if (r.sub === 'invoices' && r.id) openInvoice(r.id); };
  function openInvoice(id) {
    var v = NX.byId(NX.invoices, id); if (!v) return;
    var cust = NX.customer(v.customer) || {}, bal = (Number(v.total) || 0) - (Number(v.paid) || 0);
    var payments = arr(NX.payments).filter(function (p) { return p && p.invoice === v.id; });
    UI.drawer({ title: v.id,
      head: '<div class="row" style="gap:8px"><h2>' + esc(v.id) + '</h2>' + UI.status(v.status) + '</div><div class="small muted mt-8">' + esc(nm(cust)) + '. Issued ' + esc(v.issued || '') + ', due ' + esc(v.due || '') + '</div>',
      body: '<div class="card"><table class="t"><tbody>' +
          '<tr><td class="muted">Customer</td><td class="strong">' + esc(nm(cust)) + '</td></tr>' +
          (v.order ? '<tr><td class="muted">Order</td><td><a href="#/orders/o/' + v.order + '">' + v.order + '</a></td></tr>' : '') +
          '<tr><td class="muted">Invoice total</td><td class="num strong">' + money(v.total) + '</td></tr>' +
          '<tr><td class="muted">Recorded payments</td><td class="num">' + money(v.paid) + '</td></tr>' +
          '<tr><td class="muted">Outstanding balance</td><td class="num strong">' + money(bal) + '</td></tr>' +
        '</tbody></table></div>' +
        '<h3 style="margin:20px 0 10px">Payments</h3>' +
        (payments.length ? '<div class="card"><table class="t"><thead><tr><th>Payment</th><th>Method</th><th class="num">Amount</th><th>Verification</th></tr></thead><tbody>' +
          payments.map(function (p) { return '<tr><td class="strong">' + esc(p.id) + '<div class="small faint">' + esc(p.when || '') + '</div></td><td>' + esc(p.method || '') + '</td><td class="num">' + money(p.amount || 0) + '</td><td>' + (p.verified ? '<span class="badge good">Verified</span>' : '<span class="badge warn">Manual</span>') + '</td></tr>'; }).join('') +
          '</tbody></table></div>' : UI.empty('No payments recorded', 'Payments against this invoice will appear here.')),
      foot: (bal > 0 ? '<button class="btn" data-act="remind" data-id="' + v.id + '">Send reminder</button><button class="btn primary" data-act="record-pay" data-id="' + v.id + '">Record payment</button>' : '')
    });
  }
  A.actions['record-pay'] = function (el) {
    var v = NX.byId(NX.invoices, el.getAttribute('data-id')); if (!v) return;
    var bal = (Number(v.total) || 0) - (Number(v.paid) || 0);
    UI.modal({ title: 'Record payment for ' + v.id, ok: 'Record payment',
      body: '<div class="callout warn" style="margin-bottom:14px">' + icon('info') + '<div>This payment will be marked <b>Manually recorded</b> until it is matched to a provider confirmation or bank statement.</div></div><div class="form-grid">' +
        UI.field({ label: 'Amount (GHS)', type: 'number', required: true, min: 0.01, max: bal, value: bal, name: 'amt', err: 'Enter an amount between 0.01 and ' + money(bal) + '.' }) +
        UI.field({ label: 'Method', type: 'select', options: ['Bank transfer', 'Cash', 'MTN Mobile Money', 'Telecel Cash', 'AirtelTigo Money', 'Cheque'], name: 'method', required: true }) +
        UI.field({ label: 'Date received', type: 'date', value: todayISO(), required: true, name: 'date' }) +
        UI.field({ label: 'Reference', required: true, name: 'ref', placeholder: 'Slip, receipt or transaction ID' }) + '</div>',
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var f = A.readForm(m);
        var body = { invoice: v.id, amount: +f.amt, method: f.method, reference: f.ref, ref: f.ref, date: f.date };
        return NXActions.run(function () { return NXApi.mutate('POST', '/payments', body); }, 'Payment recorded');
      } });
  };
  A.actions.remind = function (el) {
    var v = NX.byId(NX.invoices, el.getAttribute('data-id')); if (!v) return;
    var c = NX.customer(v.customer) || {}, cName = nm(c, 'customer');
    UI.modal({ title: 'Send payment reminder', ok: 'Send reminder',
      body: UI.field({ label: 'Send via', type: 'select', options: [['whatsapp', 'WhatsApp ' + (c.phone || '')], ['email', 'Email ' + (c.email || '')]], required: true, name: 'channel' }) +
        '<div class="mt-12">' + UI.field({ label: 'Message', type: 'textarea', required: true, name: 'message', value: 'Hello ' + String(cName).split(' ')[0] + ', this is a friendly reminder that invoice ' + v.id + ' for ' + money((Number(v.total) || 0) - (Number(v.paid) || 0)) + ' was due on ' + (v.due || '') + '. Thank you, ' + ((NX.business && NX.business.name) || 'your business') + '.' }) + '</div>',
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var f = A.readForm(m);
        return NXActions.run(function () { return NXApi.mutate('POST', '/invoices/' + v.id + '/reminder', { channel: f.channel, message: f.message }); }, 'Reminder sent to ' + cName);
      } });
  };
  A.actions['new-invoice'] = function (el) {
    var oid = el && el.getAttribute ? el.getAttribute('data-order') : '';
    var o = oid ? NX.byId(NX.orders, oid) : null;
    UI.modal({ title: 'New invoice', ok: 'Create invoice', body: '<div class="form-grid">' +
      UI.field({ label: 'Customer', type: 'select', required: true, placeholder: 'Choose a customer', options: arr(NX.customers).map(function (c) { return [c.id, nm(c)]; }), value: o ? o.customer : '', name: 'cust' }) +
      UI.field({ label: 'Linked order', type: 'select', options: [['', 'None']].concat(arr(NX.orders).map(function (x) { return [x.id, x.id + ', ' + money(NX.orderTotal(x), { dp: 0 })]; })), value: oid, name: 'order' }) +
      UI.field({ label: 'Amount', type: 'number', min: 0.01, required: true, value: o ? NX.orderTotal(o) : '', name: 'amt' }) +
      UI.field({ label: 'Due date', type: 'date', required: true, value: futureISO(30), name: 'due' }) + '</div>',
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var f = A.readForm(m);
        var body = { customer: f.cust, cust: f.cust, order: f.order, amount: +f.amt, amt: +f.amt, total: +f.amt, due: f.due };
        return NXActions.run(function () { return NXApi.mutate('POST', '/invoices', body); }, 'Invoice created').then(function (result) { if (result) A.go('#/finance'); return result; });
      } });
  };
  A.actions['new-expense'] = function () {
    UI.modal({ title: 'Record expense', ok: 'Submit expense', body: '<div class="form-grid">' +
      UI.field({ label: 'Category', type: 'select', required: true, options: ['Transport and delivery', 'Utilities', 'Salaries and wages', 'Marketing', 'Rent', 'Internet and software', 'Office supplies', 'Other'], name: 'cat' }) +
      UI.field({ label: 'Amount', type: 'number', min: 0.01, required: true, name: 'amt' }) +
      UI.field({ label: 'Date', type: 'date', required: true, value: todayISO(), name: 'date' }) +
      UI.field({ label: 'Receipt', type: 'file', name: 'file' }) +
      UI.field({ label: 'Description', required: true, span: true, name: 'desc' }) + '</div><p class="hint mt-12">Larger expenses go to the business owner for approval.</p>',
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var f = A.readForm(m);
        var input = m.querySelector('[name=file]'), file = input && input.files && input.files[0];
        return NXActions.run(async function () {
          var uploaded = file ? await NXActions.uploadFile(file, {}) : null;
          var body = { category: f.cat, cat: f.cat, amount: +f.amt, amt: +f.amt, date: f.date, description: f.desc, desc: f.desc, status: +f.amt > 1000 ? 'Pending approval' : 'Approved' };
          if (uploaded && uploaded.id) body.receiptFileId = uploaded.id;
          return NXApi.mutate('POST', '/expenses', body);
        }, 'Expense submitted').then(function (result) { if (result) A.go('#/finance/expenses'); return result; });
      } });
  };

  /* ================= Employees ================= */
  var MATRIX_PERMISSIONS = {
    customers: ['customers:read', 'customers:create', 'customers:update', 'customers:merge'],
    inbox: ['inbox:read', 'inbox:respond', 'inbox:assign', 'inbox:categorise', 'inbox:takeover'],
    orders: ['orders:read', 'orders:create', 'orders:update', 'orders:cancel'],
    inventory: ['inventory:read', 'inventory:create', 'inventory:adjust'],
    finance: ['finance:read', 'finance:create', 'finance:update', 'finance:verify', 'finance:approve'],
    employees: ['employees:read', 'employees:invite', 'employees:update', 'employees:deactivate'],
    automation: ['workflows:read', 'workflows:create', 'workflows:update', 'workflows:execute'],
    agents: ['agents:read', 'agents:configure', 'agents:approve'],
    integrations: ['integrations:read', 'integrations:connect', 'integrations:disconnect'],
    audit: ['audit:read', 'audit:export']
  };
  var LEVEL_PERMISSIONS = {
    m: ['customers:read', 'customers:create', 'customers:update', 'customers:merge', 'inbox:read', 'inbox:respond', 'inbox:assign', 'inbox:categorise', 'inbox:takeover', 'orders:read', 'orders:create', 'orders:update', 'orders:cancel', 'inventory:read', 'inventory:create', 'inventory:adjust', 'finance:read', 'finance:create', 'finance:update', 'finance:verify', 'finance:approve', 'employees:read', 'employees:invite', 'employees:update', 'employees:deactivate', 'workflows:read', 'workflows:create', 'workflows:update', 'workflows:execute', 'agents:read', 'agents:configure', 'agents:approve', 'integrations:read', 'integrations:connect', 'integrations:disconnect', 'audit:read', 'audit:export'],
    e: ['customers:read', 'customers:create', 'customers:update', 'inbox:read', 'inbox:respond', 'inbox:assign', 'inbox:categorise', 'orders:read', 'orders:update', 'inventory:read', 'inventory:adjust', 'finance:read', 'employees:read', 'workflows:read', 'workflows:update', 'agents:read', 'integrations:read', 'audit:read'],
    v: ['customers:read', 'inbox:read', 'orders:read', 'inventory:read', 'finance:read', 'employees:read', 'workflows:read', 'agents:read', 'integrations:read', 'audit:read'],
    n: []
  };
  A.views.employees = function (r) {
    var tab = r.sub || '';
    var body;
    var active = arr(NX.employees).filter(function (e) { return e && e.status === 'active'; }).length;
    if (!tab) {
      body = '<div class="card"><table class="t"><thead><tr><th>Name</th><th>Department</th><th>Role</th><th>Status</th><th>Last active</th><th class="num">Open tasks</th><th></th></tr></thead><tbody>' +
        (arr(NX.employees).length ? arr(NX.employees).map(function (e) {
          return '<tr><td><div class="cell-2">' + UI.avatar(nm(e)) + '<div><div class="strong">' + esc(nm(e)) + (e.id === (A.me && A.me.emp) ? ' <span class="faint" style="font-weight:400">(you)</span>' : '') + '</div><div class="l2">' + esc(e.email || '') + '</div></div></div></td><td>' + esc(nm(NX.dept(e.dept), 'No department')) + '</td><td>' + esc(nm(NX.role(e.role), 'No role')) + '</td><td>' + UI.status(e.status) + '</td>' +
            '<td class="small muted">' + esc(e.last || '') + (e.device ? ', ' + esc(e.device) : '') + '</td><td class="num">' + (e.tasksOpen || 0) + '</td><td>' + (A.isAdmin() && e.role !== 'owner' ? '<button class="icon-btn" data-act="emp-menu" data-id="' + e.id + '" aria-label="Actions for ' + esc(nm(e)) + '">' + icon('more') + '</button>' : '') + '</td></tr>';
        }).join('') : '<tr><td colspan="7">' + UI.empty('No employees yet', 'Invited people appear here once they join.') + '</td></tr>') + '</tbody></table></div>';
    } else if (tab === 'departments') {
      body = '<div class="grid g-3">' + (arr(NX.departments).length ? arr(NX.departments).map(function (d) {
        var ms = arr(NX.employees).filter(function (e) { return e && e.dept === d.id && e.status !== 'deactivated'; });
        var hd = NX.employee(d.head);
        return '<section class="card"><div class="card-head"><div><h2>' + esc(nm(d)) + '</h2><div class="sub">' + ms.length + ' people. Head: ' + esc(nm(hd, 'Not assigned')) + '</div></div>' + (A.isAdmin() ? '<button class="icon-btn" aria-label="Edit department" data-act="edit-dept" data-id="' + d.id + '">' + icon('edit', 'i-s') + '</button>' : '') + '</div><div class="card-body"><div class="row wrap" style="gap:6px">' +
          ms.map(function (e) { return '<span class="row tag" style="gap:6px;height:28px">' + UI.avatar(nm(e), 's') + esc(String(nm(e)).split(' ')[0]) + '</span>'; }).join('') + '</div></div></section>';
      }).join('') : UI.empty('No departments yet', 'Departments appear here once they are created.')) + '</div>';
    } else {
      var mods = [['Customers', 'customers'], ['Inbox and conversations', 'inbox'], ['Orders', 'orders'], ['Inventory', 'inventory'], ['Finance', 'finance'], ['Employees and roles', 'employees'], ['Automation', 'automation'], ['AI agents', 'agents'], ['Integrations', 'integrations'], ['Audit log', 'audit']];
      var lvl = { owner: 'mmmmmmmmmm', admin: 'mmmmmmmmmv', manager: 'eeevvevevn', sales: 'eeevnnnnnn', support: 'eevnnnnnnn', inventory: 'nnvennnnnn', finance: 'vnvvennnnn' };
      var label = { m: 'Manage', e: 'Edit', v: 'View', n: 'None' };
      body = '<div class="callout" style="margin-bottom:16px">' + icon('lock') + '<div>Permissions are checked by the server on every request. Hiding a page here is not what protects the data. Changing a role that grants Finance or Employees access needs owner approval.</div></div>' +
        '<div class="card"><div class="table-wrap"><table class="t matrix"><thead><tr><th>Module</th>' + arr(NX.roles).map(function (r) { return '<th>' + esc(nm(r)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        mods.map(function (m, i) {
          return '<tr><td class="strong">' + m[0] + '</td>' + arr(NX.roles).map(function (r) {
            var levels = lvl[r.id] || '';
            var v = String(levels).charAt(i) || 'n'; var locked = r.id === 'owner';
            return '<td><select class="input input-sm" style="width:96px;margin:0 auto" aria-label="' + esc(nm(r)) + ' access to ' + m[0] + '"' + (locked || !A.isAdmin() ? ' disabled' : '') + ' data-change="perm-change" data-role="' + r.id + '" data-permission="' + m[1] + '">' + ['m', 'e', 'v', 'n'].map(function (k) { return '<option' + (k === v ? ' selected' : '') + '>' + label[k] + '</option>'; }).join('') + '</select></td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    return '<div class="page">' + head('Employees', active + ' active people across ' + arr(NX.departments).length + ' departments. Each person signs in with their own account.', A.isAdmin() ? '<button class="btn" data-act="new-dept">' + icon('plus', 'i-s') + 'Department</button><button class="btn primary" data-act="invite">' + icon('plus', 'i-s') + 'Invite people</button>' : '') +
      tabBar('employees', [['', 'People', arr(NX.employees).length], ['departments', 'Departments', arr(NX.departments).length], ['roles', 'Roles and permissions', arr(NX.roles).length]], tab) + body + '</div>';
  };
  A.actions['perm-change'] = function (el) {
    var role = el.getAttribute('data-role'), module = el.getAttribute('data-permission');
    if (!role || !module) return;
    var selected = el.options[el.selectedIndex];
    var level = ((selected && selected.textContent) || '').charAt(0).toLowerCase();
    if (!LEVEL_PERMISSIONS[level]) level = 'n';
    var permissions = {};
    (MATRIX_PERMISSIONS[module] || []).forEach(function (key) { permissions[key] = LEVEL_PERMISSIONS[level].indexOf(key) > -1; });
    return NXActions.run(function () { return NXApi.mutate('PUT', '/roles/' + role + '/permissions', { permissions: permissions }); }, 'Permissions updated for ' + nm(NX.role(role), role));
  };
  A.actions['emp-menu'] = function (el) {
    var e = NX.employee(el.getAttribute('data-id')); if (!e) return;
    var items = [{ label: 'Change role or department', icon: 'edit', fn: function () { empEdit(e); } }];
    if (e.status === 'invited') items.push({ label: 'Resend invite', icon: 'mail', fn: function () { void NXActions.run(function () { return NXApi.mutate('POST', '/employees/' + e.id + '/invite/resend', { email: e.email }); }, 'Invite resent to ' + e.email); } });
    if (e.status === 'active') items.push('sep', { label: 'Revoke access', icon: 'lock', danger: true, fn: function () { revoke(e); } });
    if (e.status === 'deactivated') items.push({ label: 'Restore access', icon: 'refresh', fn: function () { void NXActions.run(function () { return NXApi.mutate('POST', '/employees/' + e.id + '/deactivate', { active: true }); }, e.name + ' can sign in again'); } });
    UI.menu(el, items);
  };
  function empEdit(e) {
    UI.modal({ title: 'Edit ' + e.name, ok: 'Save changes', body: '<div class="form-grid">' +
      UI.field({ label: 'Role', type: 'select', options: arr(NX.roles).filter(function (r) { return r && r.id !== 'owner'; }).map(function (r) { return [r.id, nm(r)]; }), value: e.role, required: true, name: 'role' }) +
      UI.field({ label: 'Department', type: 'select', options: arr(NX.departments).map(function (d) { return [d.id, nm(d)]; }), value: e.dept, required: true, name: 'dept' }) + '</div>',
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var f = A.readForm(m);
        var body = { role: f.role, department: f.dept, dept: f.dept };
        return NXActions.run(function () { return NXApi.mutate('POST', '/employees/' + e.id + '/role', body); }, 'Role and department updated for ' + e.name);
      } });
  }
  function revoke(e) {
    UI.modal({ title: 'Revoke access for ' + e.name + '?', body: '<p>They will be signed out of the web, Windows and macOS apps immediately. Their records, messages and history stay in the workspace and remain attributed to them.</p><p class="mt-12 muted">Open conversations and tasks (' + e.tasksOpen + ') should be reassigned.</p>',
      foot: '<button class="btn" data-close>Keep access</button><button class="btn danger solid" data-ok>Revoke access</button>',
      onOk: function () {
        return NXActions.run(function () { return NXApi.mutate('POST', '/employees/' + e.id + '/deactivate', { active: false }); }, e.name + ' can no longer sign in');
      } });
  }
  A.actions.invite = function () {
    UI.modal({ title: 'Invite people', ok: 'Send invites', body: '<p class="muted" style="margin-bottom:14px">Each person gets their own sign-in. Shared accounts are not supported.</p>' +
      UI.field({ label: 'Email addresses', type: 'textarea', required: true, placeholder: 'One per line', name: 'emails', err: 'Enter at least one valid email address.' }) +
      '<div class="form-grid mt-12">' + UI.field({ label: 'Role', type: 'select', required: true, options: arr(NX.roles).filter(function (r) { return r && r.id !== 'owner'; }).map(function (r) { return [r.id, nm(r)]; }), value: 'sales', name: 'role' }) +
      UI.field({ label: 'Department', type: 'select', required: true, options: arr(NX.departments).map(function (d) { return [d.id, nm(d)]; }), value: (arr(NX.departments)[0] || {}).id || '', name: 'dept' }) + '</div>',
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var f = A.readForm(m);
        var list = f.emails.split(/[\s,;]+/).filter(Boolean);
        var bad = list.filter(function (x) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
        if (bad.length) { var fl = m.querySelector('[name=emails]').closest('.field'); fl.classList.add('has-err'); fl.querySelector('.err').textContent = 'Check these addresses: ' + bad.join(', '); return false; }
        return NXActions.run(async function () {
          for (var i = 0; i < list.length; i++) {
            await NXApi.mutate('POST', '/employees/invite', {
              email: list[i],
              name: list[i].split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }),
              role: f.role, department: f.dept, dept: f.dept
            });
          }
        }, list.length + ' invite' + (list.length > 1 ? 's' : '') + ' sent').then(function (result) { if (result) A.go('#/employees'); return result; });
      } });
  };
  A.actions['new-dept'] = function () {
    UI.modal({ title: 'New department', ok: 'Create department', body: '<div class="form-grid">' + UI.field({ label: 'Name', required: true, name: 'name' }) + UI.field({ label: 'Department head', type: 'select', options: arr(NX.employees).filter(function (e) { return e && e.status === 'active'; }).map(function (e) { return [e.id, nm(e)]; }), required: true, name: 'head' }) + '</div>',
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var f = A.readForm(m);
        return NXActions.run(function () { return NXApi.mutate('POST', '/departments', { name: f.name, head: f.head }); }, 'Department created').then(function (result) { if (result) A.go('#/employees/departments'); return result; });
      } });
  };
  A.actions['edit-dept'] = function (el) {
    var d = NX.dept(el.getAttribute('data-id')); if (!d) return;
    UI.modal({ title: 'Edit ' + nm(d), ok: 'Save changes', body: '<div class="form-grid">' + UI.field({ label: 'Name', required: true, name: 'name', value: nm(d) }) + UI.field({ label: 'Department head', type: 'select', options: arr(NX.employees).filter(function (e) { return e && e.status === 'active'; }).map(function (e) { return [e.id, nm(e)]; }), value: d.head, required: true, name: 'head' }) + '</div>',
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var f = A.readForm(m);
        return NXActions.run(function () { return NXApi.mutate('PATCH', '/departments/' + d.id, { name: f.name, head: f.head }); }, 'Department updated');
      } });
  };

  /* ================= Tasks ================= */
  A.views.tasks = function () {
    var view = A.state.taskView || 'board';
    var meRole = A.me && A.me.role;
    var who = A.state.taskWho || (meRole === 'owner' || meRole === 'admin' || meRole === 'manager' ? '' : (A.me && A.me.emp) || '');
    var ts = arr(NX.tasks).filter(function (t) { return t && (!who || t.who === who); });
    var cols = ['To do', 'In progress', 'In review', 'Done'];
    var card = function (t) {
      var e = NX.employee(t.who);
      return '<article class="kcard" tabindex="0" data-act="open-task" data-id="' + t.id + '"><div class="row between" style="align-items:flex-start;gap:8px"><div class="k-title">' + esc(t.title || '') + '</div>' + UI.prio(t.prio) + '</div>' + (t.desc ? '<div class="k-sub">' + esc(t.desc) + '</div>' : '') +
        (t.fromAgent ? '<div class="mt-8"><span class="badge ai">' + icon('sparkle', 'i-s') + 'Created by ' + esc(t.fromAgent) + '</span></div>' : '') +
        '<div class="k-foot"><span class="row ' + (t.overdue && t.status !== 'Done' ? 'down' : '') + '" style="gap:4px">' + icon('calendar', 'i-s') + (t.overdue && t.status !== 'Done' ? 'Overdue, ' : '') + esc(t.due || '') + '</span>' + UI.avatar(nm(e), 's') + '</div></article>';
    };
    var body = view === 'board'
      ? '<div class="board">' + cols.map(function (c) { var l = ts.filter(function (t) { return t.status === c; }); return '<section class="col"><div class="col-head">' + c + ' <span class="count">' + l.length + '</span></div><div class="col-body">' + l.map(card).join('') + '</div></section>'; }).join('') + '</div>'
      : '<div class="card"><table class="t"><thead><tr><th>Task</th><th>Assignee</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead><tbody>' + (ts.length ? ts.map(function (t) { var whoName = nm(NX.employee(t.who)); return '<tr class="click" data-act="open-task" data-id="' + t.id + '" tabindex="0"><td class="strong">' + esc(t.title || '') + (t.fromAgent ? ' <span class="badge ai">AI</span>' : '') + '</td><td><div class="cell-2">' + UI.avatar(whoName, 's') + '<span class="small">' + esc(whoName) + '</span></div></td><td class="' + (t.overdue && t.status !== 'Done' ? 'down' : '') + '">' + esc(t.due || '') + '</td><td>' + UI.prio(t.prio, true) + '</td><td>' + UI.status(t.status) + '</td></tr>'; }).join('') : '<tr><td colspan="5">' + UI.empty('No tasks yet', 'Tasks appear here once they are created.') + '</td></tr>') + '</tbody></table></div>';
    var people = arr(NX.employees).filter(function (e) { return e && e.status === 'active'; });
    return '<div class="page">' + head('Tasks', ts.filter(function (t) { return t.status !== 'Done'; }).length + ' open, ' + ts.filter(function (t) { return t.overdue && t.status !== 'Done'; }).length + ' overdue.', '<select class="input input-sm" style="width:auto" data-change="task-who" aria-label="Show tasks for"><option value="">Everyone</option>' + people.map(function (e) { return '<option value="' + e.id + '"' + (who === e.id ? ' selected' : '') + '>' + esc(e.name) + (e.id === A.me.emp ? ' (you)' : '') + '</option>'; }).join('') + '</select>' +
      '<div class="seg" role="group" aria-label="View"><button data-act="task-view" data-v="board" aria-pressed="' + (view === 'board') + '">' + icon('grid', 'i-s') + '</button><button data-act="task-view" data-v="list" aria-pressed="' + (view === 'list') + '">' + icon('list', 'i-s') + '</button></div><button class="btn primary" data-act="new-task">' + icon('plus', 'i-s') + 'New task</button>') + body + '</div>';
  };
  A.actions['task-view'] = function (el) { A.state.taskView = el.getAttribute('data-v'); A.render(); };
  A.actions['task-who'] = function (el) { A.state.taskWho = el.value; A.render(); };
  function taskForm(t) {
    t = t || {};
    return '<div class="form-grid">' + UI.field({ label: 'Title', required: true, name: 'title', value: t.title, span: true }) + UI.field({ label: 'Description', type: 'textarea', name: 'desc', value: t.desc, span: true }) +
      UI.field({ label: 'Assign to', type: 'select', required: true, options: arr(NX.employees).filter(function (e) { return e && e.status === 'active'; }).map(function (e) { return [e.id, nm(e)]; }), value: t.who || (A.me && A.me.emp), name: 'who' }) +
      UI.field({ label: 'Due date', required: true, name: 'due', value: t.due || '', placeholder: 'For example 28 Nov' }) +
      UI.field({ label: 'Priority', type: 'select', required: true, options: [['1', 'Low'], ['2', 'Normal'], ['3', 'High'], ['4', 'Urgent']], value: String(t.prio || 2), name: 'prio' }) +
      UI.field({ label: 'Status', type: 'select', required: true, options: ['To do', 'In progress', 'In review', 'Done'], value: t.status || 'To do', name: 'status' }) + '</div>';
  }
  function taskBody(f) {
    var e = NX.employee(f.who), dept = e ? e.dept : '';
    return {
      title: f.title, description: f.desc, desc: f.desc, who: f.who, due: f.due,
      priority: +f.prio, prio: +f.prio, status: f.status, department: dept, dept: dept
    };
  }
  A.actions['new-task'] = function () {
    UI.modal({ title: 'New task', ok: 'Create task', body: taskForm(),
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var f = A.readForm(m), e = NX.employee(f.who);
        return NXActions.run(function () { return NXApi.mutate('POST', '/tasks', taskBody(f)); }, 'Task created and ' + (e ? String(nm(e)).split(' ')[0] : 'assignee') + ' notified').then(function (result) { if (result) A.go('#/tasks'); return result; });
      } });
  };
  A.actions['open-task'] = function (el) {
    var t = NX.byId(NX.tasks, el.getAttribute('data-id')); if (!t) return;
    UI.modal({ title: 'Edit task', ok: 'Save changes', body: taskForm(t) + (t.fromAgent ? '<div class="callout ai mt-16">' + icon('sparkle') + '<div>Created by ' + esc(t.fromAgent) + ' from a workflow. Activity on this task is recorded in the audit log.</div></div>' : ''),
      onOk: function (m) {
        if (!UI.validate(m)) return false;
        var f = A.readForm(m);
        return NXActions.run(function () { return NXApi.mutate('PATCH', '/tasks/' + t.id, taskBody(f)); }, 'Task saved');
      } });
  };
})();
