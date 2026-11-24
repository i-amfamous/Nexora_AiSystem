/* Shared UI helpers: formatting, overlays, charts. */
(function () {
  var UI = {};

  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.money = function (n, opts) {
    opts = opts || {};
    var v = Number(n || 0);
    var s = v.toLocaleString('en-GH', { minimumFractionDigits: opts.dp === 0 ? 0 : 2, maximumFractionDigits: opts.dp === 0 ? 0 : 2 });
    return (opts.bare ? '' : 'GH₵ ') + s;
  };
  UI.compact = function (n) {
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  };
  UI.initials = function (name) {
    var p = String(name).replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean);
    return ((p[0] || '')[0] || '') + ((p.length > 1 ? p[p.length - 1][0] : '') || '');
  };
  UI.avatar = function (name, cls) {
    return '<span class="avatar ' + (cls || '') + '" aria-hidden="true">' + UI.esc(UI.initials(name).toUpperCase()) + '</span>';
  };
  UI.agentAvatar = function (short, cls) {
    return '<span class="avatar ai ' + (cls || '') + '" aria-hidden="true">' + UI.esc(short) + '</span>';
  };
  UI.chan = function (key, withName) {
    var c = NX.channels[key];
    if (!c) return '';
    return '<span class="chan" title="' + c.name + '"><span class="chan-ico" style="background:' + c.color + '">' + c.short + '</span>' + (withName ? UI.esc(c.name) : '') + '</span>';
  };
  UI.prio = function (p, withLabel) {
    var names = ['', 'Low', 'Normal', 'High', 'Urgent'];
    return '<span class="prio" title="Priority: ' + names[p] + '"><span class="prio-bars p' + p + '"><i></i><i></i><i></i></span>' + (withLabel ? names[p] : '') + '</span>';
  };
  UI.status = function (s) {
    var map = {
      'Paid': 'good', 'Delivered': 'good', 'Active': 'good', 'active': 'good', 'Approved': 'good', 'Succeeded': 'good', 'Received': 'good', 'Done': 'good', 'Resolved': 'good', 'Won': 'good', 'Success': 'good', 'Executed': 'good', 'connected': 'good',
      'Processing': 'info', 'Confirmed': 'info', 'Out for delivery': 'info', 'In progress': 'info', 'Sent': 'info', 'Open': 'info', 'In review': 'info',
      'Partially paid': 'warn', 'Pending approval': 'warn', 'Pending': 'warn', 'Waiting for approval': 'warn', 'Awaiting approval': 'warn', 'invited': 'warn', 'Draft': '', 'To do': '',
      'Overdue': 'bad', 'Failed': 'bad', 'Cancelled': 'bad', 'Rejected': 'bad', 'Lost': 'bad', 'Denied': 'bad', 'error': 'bad', 'deactivated': '', 'Unpaid': 'warn', 'Refunded': '', 'Skipped': '', 'Not executed': ''
    };
    var labels = { active: 'Active', invited: 'Invited', deactivated: 'Deactivated', connected: 'Connected', error: 'Needs attention', off: 'Not connected' };
    return '<span class="badge ' + (map[s] || '') + '">' + UI.esc(labels[s] || s) + '</span>';
  };
  UI.empty = function (title, text, action) {
    return '<div class="empty"><h3>' + UI.esc(title) + '</h3><p>' + UI.esc(text) + '</p>' + (action ? '<div class="mt-16">' + action + '</div>' : '') + '</div>';
  };

  /* ---------- Overlays ---------- */
  var layer = function () { return document.getElementById('overlay'); };
  UI.closeAll = function () { layer().innerHTML = ''; UI._onClose && UI._onClose(); UI._onClose = null; };

  UI.modal = function (o) {
    var html = '<div class="scrim" data-scrim>' +
      '<div class="modal ' + (o.wide ? 'wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="mdl-title">' +
      '<div class="modal-head"><h2 id="mdl-title">' + UI.esc(o.title) + '</h2><button class="icon-btn" data-close aria-label="Close">' + icon('x') + '</button></div>' +
      '<div class="modal-body">' + o.body + '</div>' +
      (o.foot !== false ? '<div class="modal-foot">' + (o.foot || '<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>' + UI.esc(o.ok || 'Save') + '</button>') + '</div>' : '') +
      '</div></div>';
    layer().innerHTML = html;
    var root = layer().firstChild;
    var first = root.querySelector('input:not([type=hidden]), select, textarea');
    setTimeout(function () { var t = first || root.querySelector('[data-ok]') || root.querySelector('[data-close]'); if (t) t.focus(); }, 20);
    root.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-scrim') || e.target.closest('[data-close]')) UI.closeAll();
      var ok = e.target.closest('[data-ok]');
      if (ok && o.onOk) {
        var res = o.onOk(root);
        if (res !== false) UI.closeAll();
      }
    });
    if (o.onMount) o.onMount(root);
    return root;
  };

  UI.drawer = function (o) {
    layer().innerHTML = '<div class="drawer-scrim" data-scrim></div>' +
      '<aside class="drawer" role="dialog" aria-modal="true" aria-label="' + UI.esc(o.title) + '">' +
      '<div class="drawer-head"><div style="min-width:0">' + (o.head || '<h2>' + UI.esc(o.title) + '</h2>') + '</div><button class="icon-btn" data-close aria-label="Close">' + icon('x') + '</button></div>' +
      '<div class="drawer-body">' + o.body + '</div>' +
      (o.foot ? '<div class="drawer-foot">' + o.foot + '</div>' : '') + '</aside>';
    var root = layer();
    root.querySelector('[data-scrim]').addEventListener('click', UI.closeAll);
    root.querySelector('[data-close]').addEventListener('click', UI.closeAll);
    root.querySelector('[data-close]').focus();
    if (o.onMount) o.onMount(root.querySelector('.drawer'));
    return root.querySelector('.drawer');
  };

  UI.menu = function (anchor, items) {
    var r = anchor.getBoundingClientRect();
    var html = '<div class="popover menu" role="menu">';
    items.forEach(function (it, i) {
      if (it === 'sep') html += '<div class="sep"></div>';
      else if (it.label && it.header) html += '<div class="menu-label">' + UI.esc(it.label) + '</div>';
      else html += '<button role="menuitem" data-i="' + i + '" class="' + (it.danger ? 'danger' : '') + '"' + (it.danger ? ' style="color:var(--bad)"' : '') + '>' + (it.icon ? icon(it.icon, 'i-s') : '') + '<span>' + UI.esc(it.label) + '</span>' + (it.checked ? '<span style="margin-left:auto">' + icon('check', 'i-s') + '</span>' : '') + '</button>';
    });
    html += '</div>';
    layer().innerHTML = '<div style="position:fixed;inset:0;z-index:49" data-scrim></div>' + html;
    var pop = layer().querySelector('.popover');
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.min(r.left, window.innerWidth - w - 8);
    var top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top = top + 'px';
    var firstBtn = pop.querySelector('button'); firstBtn && firstBtn.focus();
    layer().querySelector('[data-scrim]').addEventListener('click', UI.closeAll);
    pop.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]');
      if (!b) return;
      var it = items[+b.getAttribute('data-i')];
      UI.closeAll();
      it.fn && it.fn();
    });
  };

  UI.toast = function (msg, undo) {
    var box = document.getElementById('toasts');
    var t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.innerHTML = icon('check', 'i-s') + '<span>' + UI.esc(msg) + '</span>' + (undo ? '<button type="button">Undo</button>' : '');
    if (undo) t.querySelector('button').addEventListener('click', function () { undo(); t.remove(); });
    box.appendChild(t);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(function () { t.remove(); }, 4200);
  };

  UI.validate = function (root) {
    var ok = true;
    root.querySelectorAll('.field').forEach(function (f) { f.classList.remove('has-err'); });
    root.querySelectorAll('[required], [data-min]').forEach(function (inp) {
      var f = inp.closest('.field');
      var v = inp.value.trim();
      var bad = false;
      if (inp.hasAttribute('required') && !v) bad = true;
      if (!bad && inp.type === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) bad = true;
      if (!bad && inp.hasAttribute('data-min') && v !== '' && Number(v) < Number(inp.getAttribute('data-min'))) bad = true;
      if (!bad && inp.hasAttribute('data-max') && v !== '' && Number(v) > Number(inp.getAttribute('data-max'))) bad = true;
      if (bad) { ok = false; if (f) f.classList.add('has-err'); }
    });
    var firstBad = root.querySelector('.has-err .input');
    if (firstBad) firstBad.focus();
    return ok;
  };

  UI.field = function (o) {
    var id = 'f_' + Math.random().toString(36).slice(2, 8);
    var input;
    var attrs = (o.required ? ' required' : '') + (o.min != null ? ' data-min="' + o.min + '" min="' + o.min + '"' : '') + (o.max != null ? ' data-max="' + o.max + '" max="' + o.max + '"' : '') + (o.name ? ' name="' + o.name + '"' : '');
    if (o.type === 'select') {
      input = '<select id="' + id + '" class="input"' + attrs + '>' + (o.placeholder ? '<option value="">' + UI.esc(o.placeholder) + '</option>' : '') + o.options.map(function (op) {
        var v = Array.isArray(op) ? op[0] : op, l = Array.isArray(op) ? op[1] : op;
        return '<option value="' + UI.esc(v) + '"' + (String(o.value) === String(v) ? ' selected' : '') + '>' + UI.esc(l) + '</option>';
      }).join('') + '</select>';
    } else if (o.type === 'textarea') {
      input = '<textarea id="' + id + '" class="input"' + attrs + ' placeholder="' + UI.esc(o.placeholder || '') + '">' + UI.esc(o.value || '') + '</textarea>';
    } else {
      input = '<input id="' + id + '" class="input" type="' + (o.type || 'text') + '"' + attrs + ' value="' + UI.esc(o.value || '') + '" placeholder="' + UI.esc(o.placeholder || '') + '"' + (o.readonly ? ' readonly' : '') + '>';
    }
    return '<div class="field ' + (o.span ? 'span-2' : '') + '"><label for="' + id + '">' + UI.esc(o.label) + (o.required || o.readonly ? '' : ' <span class="faint">(optional)</span>') + '</label>' + input +
      (o.hint ? '<span class="hint">' + UI.esc(o.hint) + '</span>' : '') +
      '<span class="err">' + UI.esc(o.err || (o.label + ' is required.')) + '</span></div>';
  };

  /* ---------- Charts ----------
     Charts are declared as <div class="chart" data-chart="key"> and drawn after mount
     at their real pixel width, so text stays crisp and the hover layer is exact. */
  UI.charts = {};
  UI.chart = function (key, spec) {
    UI.charts[key] = spec;
    return '<div class="chart" data-chart="' + key + '" style="height:' + (spec.height || 220) + 'px"><div class="tip"></div></div>';
  };

  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / p;
    var m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * p;
  }

  UI.drawCharts = function (scope) {
    (scope || document).querySelectorAll('.chart[data-chart]').forEach(function (el) {
      var spec = UI.charts[el.getAttribute('data-chart')];
      if (!spec) return;
      var W = el.clientWidth, H = el.clientHeight;
      if (!W) return;
      var padL = 44, padR = 8, padT = 10, padB = 26;
      var iw = W - padL - padR, ih = H - padT - padB;
      var all = [];
      spec.series.forEach(function (s) { all = all.concat(s.values); });
      var max = niceMax(Math.max.apply(null, all) * 1.05);
      var y = function (v) { return padT + ih - (v / max) * ih; };
      var n = spec.labels.length;
      var fmt = spec.fmt || function (v) { return UI.compact(v); };
      var svg = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="' + UI.esc(spec.title || 'Chart') + '">';
      // grid
      svg += '<g class="axis">';
      for (var g = 0; g <= 4; g++) {
        var gv = max * g / 4, gy = y(gv);
        svg += '<line class="' + (g === 0 ? 'baseline' : 'gridline') + '" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy + '" y2="' + gy + '"/>';
        svg += '<text x="' + (padL - 8) + '" y="' + (gy + 4) + '" text-anchor="end">' + fmt(gv) + '</text>';
      }
      var step = Math.ceil(n / Math.max(2, Math.floor(iw / 70)));
      var xPos;
      if (spec.type === 'bar') {
        var band = iw / n;
        xPos = function (i) { return padL + band * i + band / 2; };
      } else {
        xPos = function (i) { return padL + (n === 1 ? iw / 2 : (iw * i) / (n - 1)); };
      }
      for (var i = 0; i < n; i++) {
        if (i % step !== 0 && i !== n - 1) continue;
        if (i !== n - 1 && n - 1 - i < step / 2 && spec.type !== 'bar') continue;
        svg += '<text x="' + xPos(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + UI.esc(spec.labels[i]) + '</text>';
      }
      svg += '</g>';

      if (spec.type === 'bar') {
        var band2 = iw / n, k = spec.series.length;
        var bw = Math.min(28, (band2 * 0.62) / k);
        spec.series.forEach(function (s, si) {
          s.values.forEach(function (v, i) {
            var x0 = xPos(i) - (bw * k + 2 * (k - 1)) / 2 + si * (bw + 2);
            var top = y(v), h = padT + ih - top;
            var r = Math.min(4, bw / 2, h);
            var path = 'M' + x0 + ',' + (padT + ih) + 'V' + (top + r) + 'Q' + x0 + ',' + top + ' ' + (x0 + r) + ',' + top + 'H' + (x0 + bw - r) + 'Q' + (x0 + bw) + ',' + top + ' ' + (x0 + bw) + ',' + (top + r) + 'V' + (padT + ih) + 'Z';
            svg += '<path class="bar" d="' + path + '" style="fill:' + s.color + '"/>';
          });
        });
        for (var j = 0; j < n; j++) {
          svg += '<rect class="hit" data-i="' + j + '" x="' + (padL + band2 * j) + '" y="' + padT + '" width="' + band2 + '" height="' + ih + '"/>';
        }
      } else {
        spec.series.forEach(function (s) {
          var d = s.values.map(function (v, i) { return (i ? 'L' : 'M') + xPos(i).toFixed(1) + ',' + y(v).toFixed(1); }).join('');
          svg += '<path d="' + d + '" fill="none" style="stroke:' + s.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"' + (s.dashed ? ' stroke-dasharray="4 4"' : '') + '/>';
        });
        var last = spec.series[0];
        svg += '<circle cx="' + xPos(n - 1) + '" cy="' + y(last.values[n - 1]) + '" r="4" style="fill:' + last.color + ';stroke:var(--surface)" stroke-width="2"/>';
        svg += '<line class="xhair" x1="0" x2="0" y1="' + padT + '" y2="' + (padT + ih) + '" style="display:none"/>';
        svg += '<g class="dots"></g>';
        svg += '<rect class="hit" x="' + padL + '" y="' + padT + '" width="' + iw + '" height="' + ih + '"/>';
      }
      svg += '</svg>';
      var tip = el.querySelector('.tip');
      el.innerHTML = svg;
      el.appendChild(tip);

      var showTip = function (i, px) {
        var rows = spec.series.map(function (s) {
          return '<div class="row" style="gap:6px"><i style="width:8px;height:8px;border-radius:2px;background:' + s.color + ';display:inline-block"></i><span class="k">' + UI.esc(s.name) + '</span><b style="margin-left:auto;padding-left:12px">' + (spec.tipFmt || fmt)(s.values[i]) + '</b></div>';
        }).join('');
        tip.innerHTML = '<div class="k" style="margin-bottom:4px">' + UI.esc(spec.tipLabels ? spec.tipLabels[i] : spec.labels[i]) + '</div>' + rows;
        tip.style.display = 'block';
        var tw = tip.offsetWidth;
        var left = px + 12;
        if (left + tw > W) left = px - tw - 12;
        tip.style.left = Math.max(0, left) + 'px';
        tip.style.top = padT + 'px';
      };
      var svgEl = el.querySelector('svg');
      if (spec.type === 'bar') {
        svgEl.querySelectorAll('.hit').forEach(function (h) {
          h.addEventListener('mouseenter', function () { var i = +h.getAttribute('data-i'); showTip(i, xPos(i)); });
          h.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
        });
      } else {
        var hit = svgEl.querySelector('.hit'), xh = svgEl.querySelector('.xhair'), dots = svgEl.querySelector('.dots');
        hit.addEventListener('mousemove', function (e) {
          var r = svgEl.getBoundingClientRect();
          var mx = e.clientX - r.left;
          var i = Math.round(((mx - padL) / iw) * (n - 1));
          i = Math.max(0, Math.min(n - 1, i));
          var px = xPos(i);
          xh.setAttribute('x1', px); xh.setAttribute('x2', px); xh.style.display = '';
          dots.innerHTML = spec.series.map(function (s) { return '<circle cx="' + px + '" cy="' + y(s.values[i]) + '" r="4" style="fill:' + s.color + ';stroke:var(--surface)" stroke-width="2"/>'; }).join('');
          showTip(i, px);
        });
        hit.addEventListener('mouseleave', function () { xh.style.display = 'none'; dots.innerHTML = ''; tip.style.display = 'none'; });
      }
    });
  };

  UI.legend = function (items) {
    return '<div class="legend">' + items.map(function (it) {
      return '<span><i class="' + (it.line ? 'line' : '') + '" style="background:' + it.color + (it.dashed ? ';background:none;border-top:2px dashed ' + it.color + ';height:0' : '') + '"></i>' + UI.esc(it.name) + '</span>';
    }).join('') + '</div>';
  };

  UI.hbars = function (rows, fmt) {
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }));
    return '<div class="hbars">' + rows.map(function (r) {
      return '<div class="hbar"><span class="ellipsis">' + UI.esc(r[0]) + '</span><span class="track"><i style="width:' + (r[1] / max * 100).toFixed(1) + '%"></i></span><span class="v">' + (fmt ? fmt(r[1]) : r[1]) + '</span></div>';
    }).join('') + '</div>';
  };

  window.UI = UI;
})();
