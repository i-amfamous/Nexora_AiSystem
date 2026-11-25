import { randomBytes } from 'node:crypto';
import { hashPassword } from '../dist/core/crypto.js';

/** Runtime-generated test workspace. No sample/demo records or credentials are
 * stored in the repository: every identifier and value below is created when
 * the test process starts. Structural records (roles, departments, channels,
 * integrations, agents) are added by createWorkspaceDefaults, not here. */

const hex = (bytes) => randomBytes(bytes).toString('hex');
const id = (prefix) => `${prefix}_${hex(3)}`;
const stamp = (day = 0) => new Date(Date.now() - day * 86_400_000).toISOString().slice(0, 10);

export function createFixtures() {
  const businessId = id('ws');
  const ownerEmployeeId = id('emp');
  const ownerUserId = `u_${ownerEmployeeId}`;
  const ownerEmail = `owner.${hex(3)}@example.test`;
  const ownerPassword = `Tst${hex(6)}Aa1!`;

  const f = {
    businessId, ownerEmployeeId, ownerUserId, ownerEmail, ownerPassword, ownerRole: 'owner',
    customerId: id('cus'),
    duplicateCustomerId: id('cus'),
    productId: id('prd'),
    lowStockProductId: id('prd'),
    zeroStockProductId: id('prd'),
    conversationId: id('cnv'),
    workflowId: id('wfl'),
    invoiceId: id('inv'),
    outstandingInvoiceId: id('inv'),
    orderId: id('ord'),
    financeDepartmentId: 'd5',
    agentId: 'inventory',
    agentDetailId: id('agt'),
    newPassword: `New${hex(6)}Bb2!`
  };

  const db = {};
  const add = (collection, record) => {
    if (!db[collection]) db[collection] = [];
    const now = new Date().toISOString();
    db[collection].push({ ...record, businessId, createdAt: now, updatedAt: now });
  };

  add('businesses', {
    id: businessId, name: 'Test Workspace', short: 'TW', email: ownerEmail,
    phone: '+233 30 000 0000', address: '', region: '', country: '',
    currency: 'GHS', timezone: 'Africa/Accra', plan: 'Business', status: 'active'
  });

  const employeeIds = [ownerEmployeeId];
  const employeeRoles = ['owner', 'admin', 'manager', 'sales', 'support', 'inventory', 'finance'];
  employeeRoles.slice(1).forEach((role, index) => {
    const employeeId = id('emp');
    const employeeEmail = `${role}.${hex(2)}@example.test`;
    employeeIds.push(employeeId);
    add('employees', {
      id: employeeId, name: `Member ${role}`, email: employeeEmail,
      role, dept: role === 'finance' ? f.financeDepartmentId : 'd1', status: 'active',
      last: '', device: '', tasksDone: index, tasksOpen: 0
    });
    add('users', {
      id: `u_${employeeId}`, email: employeeEmail, name: `Member ${role}`,
      employeeId, businessId, role, status: 'active', passwordHash: hashPassword(ownerPassword)
    });
  });
  add('employees', {
    id: ownerEmployeeId, name: 'Workspace Owner', email: ownerEmail,
    role: 'owner', dept: 'd1', status: 'active', last: '', device: '', tasksDone: 0, tasksOpen: 0
  });
  add('users', {
    id: ownerUserId, email: ownerEmail, name: 'Workspace Owner', employeeId: ownerEmployeeId,
    businessId, role: 'owner', status: 'active', passwordHash: hashPassword(ownerPassword)
  });
  add('userRoles', { id: id('ur'), userId: ownerUserId, roleId: 'owner' });

  const customerIds = [];
  const primaryPhone = '+233 24 1000000';
  for (let i = 0; i < 12; i++) {
    const customerId = i === 0 ? f.customerId : i === 8 ? f.duplicateCustomerId : id('cus');
    const customerEmail = `customer${i + 1}.${hex(2)}@example.test`;
    customerIds.push(customerId);
    const phone = i === 8 ? primaryPhone : `+233 24 ${String(1000000 + i).padStart(7, '0')}`;
    add('customers', {
      id: customerId, name: i === 8 ? 'Duplicate Customer' : `Customer ${i + 1}`,
      company: i === 8 ? 'Test Company' : '', phone,
      email: customerEmail, city: 'Accra',
      tags: i === 0 ? ['Wholesale', 'Repeat'] : i === 8 ? ['Retail'] : ['Retail'],
      value: 1000 + i * 100, orders: i, since: stamp(30), owner: employeeIds[3] || ownerEmployeeId, last: 'Today',
      notes: i === 0 ? [{ text: 'Generated fixture note', by: ownerEmployeeId, at: stamp() }] : [],
      ...(i === 8 ? { duplicateOf: f.customerId } : {})
    });
    add('customerIdentifiers', { id: `${customerId}_phone`, customerId, type: 'phone', value: phone });
    add('customerIdentifiers', { id: `${customerId}_email`, customerId, type: 'email', value: customerEmail });
  }

  const categories = ['Furniture', 'Stationery', 'Electronics', 'Appliances'];
  for (const category of categories) add('productCategories', { id: `cat_${category.toLowerCase()}`, name: category });
  const supplierIds = [];
  for (let i = 0; i < 4; i++) {
    const supplierId = id('sup');
    supplierIds.push(supplierId);
    add('suppliers', {
      id: supplierId, name: `Supplier ${i + 1}`, contact: `Contact ${i + 1}`,
      phone: `+233 30 ${String(2000000 + i)}`, email: `supplier${i + 1}@example.test`,
      lead: '3 days', terms: 'Net 30', open: 0
    });
  }
  const productIds = [];
  for (let i = 0; i < 12; i++) {
    const productId = i === 0 ? f.productId : i === 2 ? f.lowStockProductId : i === 5 ? f.zeroStockProductId : id('prd');
    productIds.push(productId);
    const stock = i === 0 ? 6 : i === 2 ? 3 : i === 5 ? 0 : 10 + i * 4;
    const threshold = i === 2 ? 40 : 5;
    add('products', {
      id: productId, sku: `SKU-${String(i + 1).padStart(3, '0')}`, name: `Product ${i + 1}`,
      cat: categories[i % categories.length], price: 100 + i * 25, cost: 60 + i * 15,
      stock, threshold, supplier: supplierIds[i % supplierIds.length], sold30: 5 + i
    });
    add('inventory', { id: `inv_${productId}`, productId, quantity: stock, threshold, updatedBy: ownerEmployeeId });
  }

  const orderIds = [];
  for (let i = 0; i < 12; i++) {
    const orderId = i === 0 ? f.orderId : id('ord');
    orderIds.push(orderId);
    const items = [[productIds[i % productIds.length], 1 + (i % 3)], [productIds[(i + 1) % productIds.length], 1]];
    add('orders', {
      id: orderId, customer: customerIds[i % customerIds.length], date: stamp(i % 5),
      items, status: i % 4 === 3 ? 'Draft' : 'Confirmed', pay: i % 2 ? 'Paid' : 'Unpaid',
      by: employeeIds[3], channel: 'webchat',
      history: [{ at: stamp(i % 5), status: 'Confirmed', by: employeeIds[3] }]
    });
    items.forEach((item, index) => {
      const product = db.products.find((p) => p.id === item[0]);
      add('orderItems', {
        id: `${orderId}_item_${index}`, orderId, productId: item[0], quantity: item[1],
        unitPrice: product?.price || 0, lineTotal: (product?.price || 0) * item[1]
      });
    });
  }

  for (let i = 0; i < 8; i++) {
    add('stockMovements', {
      id: id('mov'), when: stamp(i % 3), product: productIds[i % productIds.length],
      type: i % 2 ? 'Sale' : 'Received', qty: i % 2 ? -2 : 20,
      ref: orderIds[i % orderIds.length], by: employeeIds[3], after: 20
    });
  }
  for (let i = 0; i < 4; i++) {
    add('purchaseRequests', {
      id: `PR-${2000 + i}`, supplier: supplierIds[i % supplierIds.length],
      items: `Product ${i + 1} x 10`, total: 1000 + i * 100,
      status: i === 0 ? 'Pending approval' : 'Approved', by: 'Inventory Agent', byType: 'ai', date: stamp(i)
    });
  }
  for (let i = 0; i < 10; i++) {
    add('leads', {
      id: id('led'), name: `Lead ${i + 1}`, contact: `Contact ${i + 1}`, value: 1000 + i * 500,
      stage: ['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'][i % 6],
      owner: employeeIds[3], next: 'Follow up', source: 'Email', ...(i === 9 ? { ai: true } : {})
    });
  }

  const invoiceIds = [];
  for (let i = 0; i < 8; i++) {
    const invoiceId = i === 0 ? f.outstandingInvoiceId : i === 1 ? f.invoiceId : id('inv');
    invoiceIds.push(invoiceId);
    const total = 1000 + i * 250;
    add('invoices', {
      id: invoiceId, customer: i === 0 ? customerIds[3] : customerIds[0],
      order: orderIds[i % orderIds.length], issued: stamp(i), due: stamp(-14 + i),
      total, paid: i === 1 ? 0 : i === 0 ? 400 : total,
      status: i === 1 ? 'Sent' : i === 0 ? 'Partially paid' : 'Paid',
      history: [{ at: stamp(i), action: 'Invoice created', by: employeeIds[6] }],
      items: [{ id: `${invoiceId}_item_1`, description: 'Fixture item', quantity: 1, unitPrice: total, lineTotal: total }]
    });
    add('invoiceItems', {
      id: `${invoiceId}_item_1`, invoiceId, description: 'Fixture item',
      quantity: 1, unitPrice: total, lineTotal: total
    });
  }
  const expenseCategories = ['Transport', 'Utilities', 'Salaries', 'Marketing', 'Rent', 'Software'];
  for (const category of expenseCategories) add('expenseCategories', { id: `exp_${category.toLowerCase()}`, name: category });
  for (let i = 0; i < 5; i++) {
    add('payments', {
      id: id('pay'), invoice: invoiceIds[i], customer: customerIds[i], amount: 100 + i * 50,
      method: 'Bank transfer', when: stamp(i), verified: Boolean(i % 2), provider: 'Paystack',
      ref: `ref_${hex(3)}`, by: 'System'
    });
  }
  for (let i = 0; i < 6; i++) {
    add('expenses', {
      id: id('exp'), date: stamp(i), cat: expenseCategories[i], desc: `Expense ${i + 1}`,
      amount: 100 + i * 20, by: employeeIds[1], status: 'Approved'
    });
  }
  for (let i = 0; i < 10; i++) {
    add('tasks', {
      id: id('tsk'), title: `Task ${i + 1}`, desc: '', who: employeeIds[i % employeeIds.length],
      due: stamp(i % 4), prio: 2, status: i % 3 ? 'To do' : 'Done',
      dept: i % 2 ? 'd2' : f.financeDepartmentId, overdue: i === 1,
      activity: [{ at: stamp(i), action: 'Task created', by: ownerEmployeeId }]
    });
  }

  const conversationIds = [];
  for (let i = 0; i < 8; i++) {
    const conversationId = i === 0 ? f.conversationId : id('cnv');
    conversationIds.push(conversationId);
    add('conversations', {
      id: conversationId, customer: customerIds[i % customerIds.length],
      channel: i === 0 ? 'whatsapp' : ['email', 'webchat', 'telegram'][i % 3],
      status: i === 7 ? 'Resolved' : 'Open', prio: i % 4 + 1,
      cat: i === 0 ? 'Order enquiry' : 'Product question', handler: i % 2 ? 'ai' : 'human',
      assignee: i % 2 ? employeeIds[3] : null, unread: Boolean(i % 2), time: '12:00',
      draft: i === 0 ? 'Generated draft reply' : ''
    });
    add('conversationAssignments', {
      id: `asg_${conversationId}`, conversationId, employeeId: i % 2 ? employeeIds[3] : null, teamId: null
    });
    for (let m = 0; m < 3; m++) {
      add('messages', {
        id: `${conversationId}_m${m + 1}`, conversationId, dir: m === 0 ? 'in' : 'out',
        direction: m === 0 ? 'in' : 'out', text: `Message ${m + 1}`, at: '12:0' + m, status: 'read',
        sentBy: m === 0 ? customerIds[i % customerIds.length] : 'agent:sales'
      });
    }
  }
  add('messageAttachments', {
    id: id('att'), conversationId: conversationIds[0], messageId: `${conversationIds[0]}_m1`,
    name: 'fixture.txt', size: 0
  });

  for (let i = 0; i < 6; i++) {
    add('approvals', {
      id: id('apr'), kind: i === 0 ? 'Refund' : 'Purchase request',
      requester: 'Inventory Agent', requesterType: 'ai', op: `Action ${i + 1}`,
      record: `Record ${i + 1}`, reason: 'Generated fixture', status: i < 4 ? 'Pending' : 'Approved',
      when: '12:00', risk: 'Medium'
    });
  }

  const workflowIds = [];
  for (let i = 0; i < 6; i++) {
    const workflowId = i === 1 ? f.workflowId : id('wfl');
    workflowIds.push(workflowId);
    const active = i !== 5;
    add('workflows', {
      id: workflowId, name: `Workflow ${i + 1}`, on: active, active,
      trigger: i === 1 ? 'New message received' : 'Scheduled event',
      conditions: i === 1
        ? [{ field: 'channel', operator: 'equals', value: 'WhatsApp' }, { field: 'category', operator: 'equals', value: 'Order enquiry' }]
        : [],
      actions: i === 1
        ? [{ type: 'trigger_agent', title: 'Trigger Sales Agent', agentId: 'sales' }, { type: 'assign_conversation', title: 'Assign conversation', who: employeeIds[3] }]
        : [{ type: 'notify', title: 'Notify owner' }],
      runs: i, ok: i, last: stamp(0), approval: false
    });
    add('workflowTriggers', {
      id: `wt_${workflowId}`, workflowId,
      trigger: i === 1 ? 'message.received' : 'scheduled.daily',
      label: i === 1 ? 'New message received' : 'Daily schedule'
    });
  }
  for (let i = 0; i < 6; i++) {
    add('workflowExecutions', {
      id: id('wfe'), wf: workflowIds[i % workflowIds.length], workflowId: workflowIds[i % workflowIds.length],
      when: stamp(i), result: i === 2 ? 'Failed' : 'Succeeded', dur: '0.1 s',
      detail: `Execution ${i + 1}`, jobId: `job_${hex(3)}`
    });
  }

  for (let i = 0; i < 6; i++) {
    add('notifications', {
      id: id('ntf'), type: 'info', title: `Notification ${i + 1}`, body: 'Generated fixture',
      when: '12:00', unread: i < 3, go: '#/overview', recipientId: ownerEmployeeId,
      channels: ['inApp', 'desktop']
    });
  }
  const auditActions = ['Signed in', 'Created order', 'Verified payment', 'Approved ai action', 'Executed workflow', 'Updated settings'];
  for (let i = 0; i < 12; i++) {
    add('auditLogs', {
      id: id('aud'), occurredAt: new Date(Date.now() - i * 3600_000).toISOString(),
      when: stamp(0), actorId: ownerEmployeeId, actor: 'Workspace Owner', actorType: 'Employee', type: 'Employee',
      action: auditActions[i % auditActions.length], resource: `Record ${i}`, res: `Record ${i}`,
      result: 'Success', approval: ''
    });
  }
  for (let i = 0; i < 3; i++) {
    add('sessions', {
      id: id('ses'), device: `Device ${i + 1}`, where: 'Local', when: stamp(i),
      current: i === 0, icon: i ? 'globe' : 'monitor',
      userId: ownerUserId, employeeId: ownerEmployeeId, active: true, tokenHash: hashPassword(`fixture-session-${i}`)
    });
  }

  add('metrics', { id: 'sales30', value: Array.from({ length: 30 }, (_, i) => 100 + i * 5) });
  add('metrics', { id: 'sales30prev', value: Array.from({ length: 30 }, (_, i) => 90 + i * 4) });
  add('metrics', { id: 'salesByChannel', value: [['Web', 1200], ['Email', 800]] });
  add('metrics', { id: 'convVolume', value: Array.from({ length: 14 }, (_, i) => 2 + (i % 5)) });
  add('metrics', { id: 'aiHandled', value: Array.from({ length: 14 }, (_, i) => 1 + (i % 4)) });

  f.db = db;
  return f;
}

/** Insert generated records into a bare store for module-level unit tests. */
export async function insertFixtures(store, fixtures, collections) {
  const names = collections || Object.keys(fixtures.db);
  await store.transaction(async () => {
    for (const collection of names) {
      // Structural metrics are created by createWorkspaceDefaults.
      if (collection === 'metrics') continue;
      for (const record of fixtures.db[collection] || []) {
        await store.insert(collection, record, { businessId: fixtures.businessId });
      }
    }
  });
}

/** NX-shaped payload for the DOM sweep. Deep links use fixture IDs. */
export function nxPayload(f) {
  const channels = {
    whatsapp: { id: 'whatsapp', name: 'WhatsApp', short: 'W', color: '#1f8f4e' },
    email: { id: 'email', name: 'Email', short: 'E', color: '#5b6470' },
    webchat: { id: 'webchat', name: 'Website chat', short: 'C', color: '#1e5b45' },
    telegram: { id: 'telegram', name: 'Telegram', short: 'T', color: '#2a7fc0' }
  };
  const agents = ['support', 'sales', 'inventory', 'finance', 'ops', 'analyst'].map((agentId) => ({
    id: agentId, name: `Agent ${agentId}`, short: agentId.slice(0, 2).toUpperCase(),
    description: 'Generated fixture agent', desc: 'Generated fixture agent', duties: ['Duty 1'],
    on: true, enabled: true, level: 'suggest', automationLevel: 'suggest', dailyLimit: 150,
    locked: [], lockedActions: [],
    tools: [['products.search', 'Read product catalogue', true]],
    runs: 0, success: 0, successRate: 0, escal: 0, escalations: 0,
    usage: 0, usagePercent: 0
  }));
  return {
    business: { ...f.db.businesses[0], created: stamp() },
    departments: ['d1', 'd2', 'd3', 'd4', 'd5'].map((departmentId, i) => ({ id: departmentId, name: `Department ${i + 1}`, head: f.ownerEmployeeId, color: '#1e5b45' })),
    roles: ['owner', 'admin', 'manager', 'sales', 'support', 'inventory', 'finance'].map((roleId) => ({ id: roleId, name: roleId })),
    employees: f.db.employees,
    channels,
    customers: f.db.customers,
    products: f.db.products,
    suppliers: f.db.suppliers,
    movements: f.db.stockMovements,
    purchaseRequests: f.db.purchaseRequests,
    orders: f.db.orders,
    leads: f.db.leads,
    stages: ['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'],
    invoices: f.db.invoices,
    payments: f.db.payments,
    expenses: f.db.expenses,
    tasks: f.db.tasks,
    conversations: f.db.conversations,
    agents,
    approvals: f.db.approvals,
    workflows: f.db.workflows,
    workflowTriggers: f.db.workflowTriggers,
    executions: f.db.workflowExecutions,
    integrations: [],
    notifications: f.db.notifications,
    audit: f.db.auditLogs,
    sessions: f.db.sessions,
    sales30: f.db.metrics.find((m) => m.id === 'sales30').value,
    sales30prev: f.db.metrics.find((m) => m.id === 'sales30prev').value,
    salesByChannel: f.db.metrics.find((m) => m.id === 'salesByChannel').value,
    convVolume: f.db.metrics.find((m) => m.id === 'convVolume').value,
    aiHandled: f.db.metrics.find((m) => m.id === 'aiHandled').value,
    notificationPreferences: { inApp: true, desktop: true, email: false, assignment: true, stock: true, approval: true, workflowFailure: true },
    conversationNotes: [], customerNotes: []
  };
}
