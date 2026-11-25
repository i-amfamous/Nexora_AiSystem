/* Empty client shell. All authoritative records arrive from /api/v1/bootstrap
   and are scoped to the authenticated workspace. This file intentionally holds
   no sample accounts, customers, transactions or credentials. */
(function () {
  var D = {};

  D.business = {
    id: '', name: '', short: '', email: '', phone: '', address: '',
    region: '', country: '', currency: 'GHS', timezone: 'Africa/Accra',
    industry: '', plan: '', created: '', status: ''
  };

  D.departments = [];
  D.roles = [];
  D.employees = [];
  D.channels = {};
  D.customers = [];
  D.products = [];
  D.suppliers = [];
  D.movements = [];
  D.purchaseRequests = [];
  D.orders = [];
  D.leads = [];
  D.stages = ['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'];
  D.invoices = [];
  D.payments = [];
  D.expenses = [];
  D.tasks = [];
  D.conversations = [];
  D.agents = [];
  D.approvals = [];
  D.workflows = [];
  D.executions = [];
  D.integrations = [];
  D.notifications = [];
  D.audit = [];
  D.sessions = [];
  D.sales30 = [];
  D.sales30prev = [];
  D.salesByChannel = [];
  D.convVolume = [];
  D.aiHandled = [];

  // Lookup helpers stay available for bootstrap-populated collections.
  D.byId = function (list, id) {
    var rows = Array.isArray(list) ? list : [];
    for (var i = 0; i < rows.length; i++) if (rows[i] && rows[i].id === id) return rows[i];
    return null;
  };
  D.customer = function (id) { return D.byId(D.customers, id); };
  D.employee = function (id) { return D.byId(D.employees, id); };
  D.product = function (id) { return D.byId(D.products, id); };
  D.dept = function (id) { return D.byId(D.departments, id); };
  D.role = function (id) { return D.byId(D.roles, id); };
  D.supplier = function (id) { return D.byId(D.suppliers, id); };
  D.orderTotal = function (o) {
    var t = 0;
    var items = (o && Array.isArray(o.items)) ? o.items : [];
    items.forEach(function (it) {
      var p = D.product(it[0]);
      if (p) t += Number(p.price || 0) * Number(it[1] || 0);
    });
    return t;
  };

  window.NX = D;
})();
