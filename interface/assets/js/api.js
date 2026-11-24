/* Nexora API client. All workspace data is loaded from /api/v1 and kept in the
   original NX object so the existing views continue to render live server data. */
(function () {
  var TOKEN_KEY = 'nexora.token';
  var origin = (location && location.protocol !== 'file:') ? location.origin : 'http://localhost:4000';
  var BASE = window.NEXORA_API_BASE || (origin + '/api/v1');
  var WS_BASE = window.NEXORA_WS_BASE || (BASE.replace(/\/api\/v1$/, '').replace(/^http/, 'ws') + '/ws');
  var socket = null;
  var realtimeWanted = false;
  var reconnectTimer = null;
  var pingTimer = null;
  var retries = 0;
  var refreshPromise = null;
  var refreshTimer = null;

  function idempotencyKey() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'nx-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function setToken(token) {
    try { localStorage.setItem(TOKEN_KEY, token || ''); } catch (e) {}
  }

  function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  function apiError(response, payload) {
    var detail = (payload && payload.error) || {};
    var error = new Error(detail.message || ('Request failed (' + response.status + ')'));
    error.status = response.status;
    error.code = detail.code || 'REQUEST_FAILED';
    error.details = detail.details;
    error.requestId = payload && payload.requestId;
    return error;
  }

  async function request(method, path, body, options) {
    options = options || {};
    var headers = { 'accept': 'application/json' };
    var token = getToken();
    if (token) headers.authorization = 'Bearer ' + token;
    var hasBody = body !== undefined && body !== null;
    if (hasBody) headers['content-type'] = 'application/json';
    if (options.idempotencyKey !== false && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      headers['idempotency-key'] = options.idempotencyKey || idempotencyKey();
    }
    if (options.ifMatch) headers['if-match'] = options.ifMatch;

    var response = await fetch(BASE + path, {
      method: method,
      headers: headers,
      body: hasBody ? JSON.stringify(body) : undefined,
      credentials: 'same-origin'
    });
    if (response.status === 204) return null;
    var text = await response.text();
    var payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch (e) { payload = text; }
    }
    if (!response.ok) throw apiError(response, payload);
    if (payload && Object.prototype.hasOwnProperty.call(payload, 'data')) return payload.data;
    return payload;
  }

  function asNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function normalize(payload) {
    var data = JSON.parse(JSON.stringify(payload || {}));
    if (data.conversations) {
      data.conversations = data.conversations.map(function (c) {
        return Object.assign({}, c, {
          prio: c.prio !== undefined ? c.prio : asNumber(c.priority, 0),
          cat: c.cat || c.category || 'General',
          handler: c.handler || c.mode || 'ai',
          time: c.time || c.last || '',
          messages: c.messages || []
        });
      });
    }
    if (data.tasks) {
      data.tasks = data.tasks.map(function (task) {
        return Object.assign({}, task, {
          prio: task.prio !== undefined ? task.prio : asNumber(task.priority, 0),
          dept: task.dept || task.department || ''
        });
      });
    }
    if (data.expenses) {
      data.expenses = data.expenses.map(function (expense) {
        return Object.assign({}, expense, {
          cat: expense.cat || expense.category || 'Other',
          amt: expense.amt !== undefined ? expense.amt : asNumber(expense.amount, 0),
          desc: expense.desc || expense.description || ''
        });
      });
    }
    if (data.payments) {
      data.payments = data.payments.map(function (payment) {
        return Object.assign({}, payment, {
          amt: payment.amt !== undefined ? payment.amt : asNumber(payment.amount, 0),
          ref: payment.ref || payment.reference || ''
        });
      });
    }
    if (data.notifications) {
      data.notifications = data.notifications.map(function (notification) {
        return Object.assign({}, notification, { when: notification.when || notification.createdAt || '' });
      });
    }
    if (data.workflows) {
      data.workflows = data.workflows.map(function (workflow) {
        var actions = (workflow.actions || []).map(function (action) {
          if (typeof action === 'string') return action;
          if (action.title) return action.title;
          var type = action.type || '';
          if (type === 'trigger_agent') return 'Trigger ' + (action.agentId || 'predefined') + ' Agent';
          if (type === 'create_task') return 'Create a task';
          if (type === 'assign_conversation') return 'Assign conversation';
          if (type === 'notify') return 'Send notification';
          if (type === 'prepare_approval') return 'Prepare approval request';
          return type;
        });
        var conds = (workflow.conditions || []).map(function (condition) {
          return [condition.field, condition.operator === 'equals' ? 'is' : condition.operator === 'notEquals' ? 'is not' : condition.operator === 'greaterThan' ? 'is above' : condition.operator === 'lessThan' ? 'is below' : 'contains', String(condition.value)];
        });
        return Object.assign({}, workflow, {
          on: workflow.on !== undefined ? workflow.on : workflow.active === true,
          trigger: workflow.trigger || workflow.label || '',
          conds: workflow.conds || conds,
          actions: actions
        });
      });
    }
    return data;
  }

  function applyBootstrap(payload) {
    var data = normalize(payload);
    Object.keys(data).forEach(function (key) {
      if (data[key] !== undefined && data[key] !== null && window.NX) window.NX[key] = data[key];
    });
    window.dispatchEvent(new CustomEvent('nexora:data', { detail: data }));
    return data;
  }

  function finishRefresh() {
    refreshPromise = null;
  }

  function refresh(immediate) {
    if (refreshPromise) return refreshPromise;
    if (!immediate) {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function () { void refresh(true); }, 100);
      return Promise.resolve();
    }
    clearTimeout(refreshTimer);
    refreshPromise = request('GET', '/bootstrap').then(function (data) {
      applyBootstrap(data);
      if (window.App && App.signedIn) {
        App.renderShell();
        App.render();
      }
      return data;
    }).catch(function (error) {
      if (error.status === 401) {
        clearToken();
        stopRealtime();
        if (window.App) {
          App.signedIn = false;
          location.hash = '#/auth/login';
          App.render();
        }
      }
      throw error;
    }).then(function (value) { finishRefresh(); return value; }, function (error) { finishRefresh(); throw error; });
    return refreshPromise;
  }

  function mutate(method, path, body, options) {
    return request(method, path, body, options).then(function (result) {
      if (window.App && App.signedIn) void refresh(false);
      return result;
    });
  }

  function dataUrlToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '').split(',')[1] || ''); };
      reader.onerror = function () { reject(new Error('Could not read the selected file')); };
      reader.readAsDataURL(file);
    });
  }

  function handleSocketMessage(event) {
    var message;
    try { message = JSON.parse(event.data || '{}'); } catch (e) { return; }
    if (message.type === 'connected' || message.type === 'pong') {
      retries = 0;
      return;
    }
    void refresh(false);
  }

  function connectRealtime() {
    stopRealtime();
    if (!getToken() || typeof WebSocket === 'undefined') return;
    realtimeWanted = true;
    var url = WS_BASE + '?token=' + encodeURIComponent(getToken());
    try { socket = new WebSocket(url); } catch (e) { return; }
    socket.onmessage = handleSocketMessage;
    socket.onopen = function () {
      retries = 0;
      pingTimer = setInterval(function () {
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
      }, 30000);
    };
    socket.onclose = function () {
      clearInterval(pingTimer);
      if (!realtimeWanted || !getToken()) return;
      retries = Math.min(15, retries + 1);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectRealtime, Math.min(15000, retries * 1000));
    };
    socket.onerror = function () { /* onclose handles reconnect */ };
  }

  function stopRealtime() {
    realtimeWanted = false;
    clearTimeout(reconnectTimer);
    clearInterval(pingTimer);
    if (socket) {
      try { socket.close(); } catch (e) {}
      socket = null;
    }
  }

  async function restoreSession() {
    var identity = await request('GET', '/auth/me');
    var bootstrap = await request('GET', '/bootstrap');
    return {
      me: identity.user,
      context: identity.context,
      permissions: identity.permissions || [],
      bootstrap: bootstrap
    };
  }

  async function login(email, password) {
    var result = await request('POST', '/auth/login', { email: email, password: password });
    setToken(result.token);
    return result;
  }

  async function register(input) {
    var result = await request('POST', '/auth/register', input);
    setToken(result.token);
    return result;
  }

  async function download(path, filename) {
    var response = await fetch(BASE + path, {
      headers: { authorization: 'Bearer ' + getToken() },
      credentials: 'same-origin'
    });
    if (!response.ok) {
      var payload = await response.json().catch(function () { return null; });
      throw apiError(response, payload);
    }
    var blob = await response.blob();
    var href = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = href;
    link.download = filename || 'nexora-export';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
  }

  window.NXApi = {
    base: BASE,
    request: request,
    mutate: mutate,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    idempotencyKey: idempotencyKey,
    login: login,
    register: register,
    restoreSession: restoreSession,
    applyBootstrap: applyBootstrap,
    normalize: normalize,
    refresh: refresh,
    connectRealtime: connectRealtime,
    stopRealtime: stopRealtime,
    dataUrlToBase64: dataUrlToBase64,
    download: download
  };
})();
