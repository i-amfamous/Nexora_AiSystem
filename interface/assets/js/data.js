/* Sample workspace data. In production every record here comes from /api/v1
   and is scoped to the authenticated workspace on the server. */
(function () {
  var D = {};

  D.business = {
    id: 'ws_REDACTED', name: 'Example Workspace Ltd', short: 'AH',
    email: 'hello@example.test', phone: '+233 30 000 0000',
    address: '14 Ring Road Central, Accra', region: 'Greater Accra', country: 'Ghana',
    currency: 'GHS', timezone: 'Africa/Accra (GMT+0)', industry: 'Retail and distribution',
    plan: 'Business', created: '3 Feb 2026'
  };

  D.departments = [
    { id: 'd1', name: 'Management', head: 'e1', color: '#1e5b45' },
    { id: 'd2', name: 'Sales', head: 'e3', color: '#2a78d6' },
    { id: 'd3', name: 'Customer support', head: 'e5', color: '#4b4a9c' },
    { id: 'd4', name: 'Inventory and logistics', head: 'e7', color: '#9a6a00' },
    { id: 'd5', name: 'Finance', head: 'e9', color: '#b42e2e' }
  ];

  D.roles = [
    { id: 'owner', name: 'Business owner', desc: 'Full control of the workspace, billing and approvals.', system: true },
    { id: 'admin', name: 'Administrator', desc: 'Manages people, departments and settings within granted permissions.', system: true },
    { id: 'manager', name: 'Department manager', desc: 'Monitors a department, assigns tasks and approves requests.', system: true },
    { id: 'sales', name: 'Sales', desc: 'Customers, leads and orders.', system: false },
    { id: 'support', name: 'Customer support', desc: 'Assigned conversations and permitted customer data.', system: false },
    { id: 'inventory', name: 'Inventory', desc: 'Products, stock movements, suppliers and purchase requests.', system: false },
    { id: 'finance', name: 'Finance', desc: 'Invoices, payments, expenses and financial reports.', system: false }
  ];

  D.employees = [
    { id: 'e1', name: 'Owner Example', email: 'owner@example.test', role: 'owner', dept: 'd1', status: 'active', last: 'Online now', device: 'macOS', tasksDone: 18, tasksOpen: 3 },
    { id: 'e2', name: 'Adwoa Sarpong', email: 'adwoa@example.test', role: 'admin', dept: 'd1', status: 'active', last: '12 min ago', device: 'Web', tasksDone: 24, tasksOpen: 4 },
    { id: 'e3', name: 'Kofi Mensah', email: 'kofi.m@example.test', role: 'manager', dept: 'd2', status: 'active', last: 'Online now', device: 'Windows', tasksDone: 31, tasksOpen: 5 },
    { id: 'e4', name: 'Esi Quaye', email: 'esi@example.test', role: 'sales', dept: 'd2', status: 'active', last: 'Online now', device: 'Windows', tasksDone: 27, tasksOpen: 6 },
    { id: 'e5', name: 'Yaw Boakye', email: 'yaw@example.test', role: 'manager', dept: 'd3', status: 'active', last: '3 min ago', device: 'Web', tasksDone: 22, tasksOpen: 2 },
    { id: 'e6', name: 'Akua Asantewaa', email: 'akua@example.test', role: 'support', dept: 'd3', status: 'active', last: 'Online now', device: 'macOS', tasksDone: 35, tasksOpen: 4 },
    { id: 'e7', name: 'Nii Armah', email: 'nii@example.test', role: 'manager', dept: 'd4', status: 'active', last: '1 h ago', device: 'Windows', tasksDone: 16, tasksOpen: 7 },
    { id: 'e8', name: 'Selasi Agbeko', email: 'selasi@example.test', role: 'inventory', dept: 'd4', status: 'active', last: '25 min ago', device: 'Windows', tasksDone: 20, tasksOpen: 3 },
    { id: 'e9', name: 'Abena Owusu', email: 'abena.o@example.test', role: 'finance', dept: 'd5', status: 'active', last: '8 min ago', device: 'macOS', tasksDone: 19, tasksOpen: 2 },
    { id: 'e10', name: 'Fiifi Ansah', email: 'fiifi@example.test', role: 'sales', dept: 'd2', status: 'invited', last: 'Invite sent 2 days ago', device: '', tasksDone: 0, tasksOpen: 0 },
    { id: 'e11', name: 'Mawuli Dzah', email: 'mawuli@example.test', role: 'support', dept: 'd3', status: 'deactivated', last: 'Access revoked 12 Oct', device: '', tasksDone: 41, tasksOpen: 0 }
  ];

  D.channels = {
    whatsapp: { name: 'WhatsApp', short: 'W', color: '#1f8f4e' },
    email: { name: 'Email', short: 'E', color: '#5b6470' },
    telegram: { name: 'Telegram', short: 'T', color: '#2a7fc0' },
    webchat: { name: 'Website chat', short: 'C', color: '#1e5b45' },
    instagram: { name: 'Instagram', short: 'I', color: '#b0407a' },
    messenger: { name: 'Messenger', short: 'M', color: '#3b5bdb' }
  };

  D.customers = [
    { id: 'c1', name: 'Ama Mensah', company: 'Mensah Pharmacy', phone: '+233 24 412 5590', email: 'ama@mensahpharmacy.com', city: 'Kumasi', tags: ['Wholesale', 'Repeat'], value: 48250, orders: 14, since: 'Mar 2026', owner: 'e4', last: 'Today' },
    { id: 'c2', name: 'Kwame Boateng', company: 'Boateng & Sons Hardware', phone: '+233 20 118 7702', email: 'kwame@boatengsons.com', city: 'Accra', tags: ['Wholesale'], value: 31900, orders: 9, since: 'Feb 2026', owner: 'e3', last: 'Today' },
    { id: 'c3', name: 'Efua Owusu', company: '', phone: '+233 55 902 3318', email: 'efua.owusu@gmail.com', city: 'Takoradi', tags: ['Retail'], value: 2860, orders: 4, since: 'Jun 2026', owner: 'e4', last: 'Yesterday' },
    { id: 'c4', name: 'Kofi Asante', company: 'Asante Logistics', phone: '+233 26 774 1029', email: 'kofi@asantelogistics.com', city: 'Tema', tags: ['Corporate', 'Net 30'], value: 67400, orders: 11, since: 'Feb 2026', owner: 'e3', last: '2 days ago' },
    { id: 'c5', name: 'Abena Darko', company: 'Darko Schools Complex', phone: '+233 24 551 0084', email: 'bursar@darkoschools.edu.gh', city: 'Koforidua', tags: ['Institution', 'Net 30'], value: 54120, orders: 6, since: 'Apr 2026', owner: 'e4', last: 'Today' },
    { id: 'c6', name: 'Yaw Osei', company: '', phone: '+233 50 330 6611', email: 'yawosei@yahoo.com', city: 'Accra', tags: ['Retail', 'New'], value: 640, orders: 1, since: 'Nov 2026', owner: 'e4', last: 'Today' },
    { id: 'c7', name: 'Akosua Frimpong', company: 'Frimpong Events', phone: '+233 27 201 4456', email: 'akosua@frimpongevents.com', city: 'Accra', tags: ['Corporate'], value: 12780, orders: 5, since: 'May 2026', owner: 'e3', last: '4 days ago' },
    { id: 'c8', name: 'Nana Kwesi Appiah', company: 'Appiah Clinic', phone: '+233 24 908 2233', email: 'admin@appiahclinic.com', city: 'Cape Coast', tags: ['Institution'], value: 22310, orders: 7, since: 'Mar 2026', owner: 'e4', last: '1 week ago' },
    { id: 'c9', name: 'Ama Mensa', company: 'Mensah Pharmacy', phone: '+233 24 412 5590', email: 'ama.mensah@gmail.com', city: 'Kumasi', tags: ['Retail'], value: 380, orders: 1, since: 'Nov 2026', owner: 'e4', last: '3 days ago', duplicateOf: 'c1' },
    { id: 'c10', name: 'Edem Kpodo', company: 'Kpodo Co-working', phone: '+233 20 664 9012', email: 'edem@kpodo.space', city: 'Ho', tags: ['Corporate', 'New'], value: 8900, orders: 2, since: 'Oct 2026', owner: 'e3', last: 'Yesterday' },
    { id: 'c11', name: 'Gifty Annan', company: '', phone: '+233 54 118 3390', email: 'gifty.annan@outlook.com', city: 'Accra', tags: ['Retail'], value: 1540, orders: 3, since: 'Aug 2026', owner: 'e4', last: '2 weeks ago' },
    { id: 'c12', name: 'Samuel Tetteh', company: 'Tetteh Printing Press', phone: '+233 24 773 5521', email: 'sam@tettehprint.com', city: 'Accra', tags: ['Wholesale', 'Repeat'], value: 39650, orders: 12, since: 'Feb 2026', owner: 'e3', last: 'Today' }
  ];

  D.products = [
    { id: 'p1', sku: 'OFC-CH-ERG', name: 'Ergonomic office chair', cat: 'Furniture', price: 1450, cost: 980, stock: 6, threshold: 10, supplier: 's1', sold30: 22 },
    { id: 'p2', sku: 'OFC-DSK-140', name: 'Office desk 140 cm', cat: 'Furniture', price: 2100, cost: 1420, stock: 14, threshold: 6, supplier: 's1', sold30: 9 },
    { id: 'p3', sku: 'PPR-A4-80', name: 'A4 paper 80gsm (box of 5 reams)', cat: 'Stationery', price: 285, cost: 210, stock: 3, threshold: 40, supplier: 's2', sold30: 140 },
    { id: 'p4', sku: 'PRT-LJ-M211', name: 'Laser printer M211', cat: 'Electronics', price: 3250, cost: 2600, stock: 11, threshold: 4, supplier: 's3', sold30: 7 },
    { id: 'p5', sku: 'TNR-136A', name: 'Toner cartridge 136A', cat: 'Electronics', price: 690, cost: 455, stock: 48, threshold: 20, supplier: 's3', sold30: 36 },
    { id: 'p6', sku: 'UPS-1500', name: 'UPS 1500VA', cat: 'Electronics', price: 1890, cost: 1350, stock: 0, threshold: 5, supplier: 's3', sold30: 12 },
    { id: 'p7', sku: 'FAN-STD-16', name: 'Standing fan 16 inch', cat: 'Appliances', price: 540, cost: 360, stock: 63, threshold: 15, supplier: 's4', sold30: 51 },
    { id: 'p8', sku: 'WB-120-90', name: 'Whiteboard 120 x 90 cm', cat: 'Furniture', price: 760, cost: 480, stock: 21, threshold: 8, supplier: 's1', sold30: 14 },
    { id: 'p9', sku: 'PEN-BLU-50', name: 'Ballpoint pens blue (pack of 50)', cat: 'Stationery', price: 95, cost: 58, stock: 210, threshold: 60, supplier: 's2', sold30: 188 },
    { id: 'p10', sku: 'FLD-BOX-12', name: 'Box files (pack of 12)', cat: 'Stationery', price: 180, cost: 118, stock: 34, threshold: 25, supplier: 's2', sold30: 41 },
    { id: 'p11', sku: 'AC-1.5HP', name: 'Split air conditioner 1.5HP', cat: 'Appliances', price: 6800, cost: 5400, stock: 4, threshold: 3, supplier: 's4', sold30: 5 },
    { id: 'p12', sku: 'CAB-FIL-4D', name: 'Filing cabinet 4 drawer', cat: 'Furniture', price: 1680, cost: 1150, stock: 9, threshold: 5, supplier: 's1', sold30: 6 }
  ];

  D.suppliers = [
    { id: 's1', name: 'Kumasi Furniture Works', contact: 'Owusu Ansah', phone: '+233 32 202 4410', email: 'orders@kfw.com.gh', lead: '7 days', terms: 'Net 30', open: 1 },
    { id: 's2', name: 'Accra Paper Mart', contact: 'Linda Amoah', phone: '+233 30 221 8890', email: 'sales@accrapapermart.com', lead: '2 days', terms: 'Net 14', open: 1 },
    { id: 's3', name: 'TechSource West Africa', contact: 'Chidi Okafor', phone: '+233 30 277 3301', email: 'b2b@techsourcewa.com', lead: '10 days', terms: 'Prepaid', open: 1 },
    { id: 's4', name: 'Coolbreeze Appliances', contact: 'Fatima Iddrisu', phone: '+233 37 202 1180', email: 'trade@coolbreeze.com.gh', lead: '5 days', terms: 'Net 30', open: 0 }
  ];

  D.movements = [
    { id: 'm1', when: 'Today, 14:22', product: 'p3', type: 'Sale', qty: -12, ref: 'ORD-10482', by: 'e4', after: 3 },
    { id: 'm2', when: 'Today, 11:05', product: 'p6', type: 'Sale', qty: -2, ref: 'ORD-10479', by: 'e3', after: 0 },
    { id: 'm3', when: 'Today, 09:40', product: 'p7', type: 'Received', qty: 40, ref: 'PR-0218', by: 'e8', after: 63 },
    { id: 'm4', when: 'Yesterday, 16:10', product: 'p1', type: 'Sale', qty: -4, ref: 'ORD-10471', by: 'e4', after: 6 },
    { id: 'm5', when: 'Yesterday, 15:02', product: 'p5', type: 'Adjustment', qty: -2, ref: 'Damaged in transit', by: 'e8', after: 48 },
    { id: 'm6', when: 'Yesterday, 10:30', product: 'p9', type: 'Received', qty: 150, ref: 'PR-0216', by: 'e8', after: 210 },
    { id: 'm7', when: '22 Nov, 13:44', product: 'p4', type: 'Return', qty: 1, ref: 'ORD-10455', by: 'e6', after: 11 },
    { id: 'm8', when: '22 Nov, 09:15', product: 'p11', type: 'Sale', qty: -1, ref: 'ORD-10452', by: 'e3', after: 4 }
  ];

  D.purchaseRequests = [
    { id: 'PR-0221', supplier: 's2', items: 'A4 paper 80gsm x 80 boxes', total: 16800, status: 'Pending approval', by: 'Inventory Agent', byType: 'ai', date: 'Today' },
    { id: 'PR-0220', supplier: 's3', items: 'UPS 1500VA x 10', total: 13500, status: 'Approved', by: 'Selasi Agbeko', byType: 'human', date: 'Yesterday' },
    { id: 'PR-0219', supplier: 's1', items: 'Ergonomic office chair x 15', total: 14700, status: 'Draft', by: 'Nii Armah', byType: 'human', date: '22 Nov' },
    { id: 'PR-0218', supplier: 's4', items: 'Standing fan 16 inch x 40', total: 14400, status: 'Received', by: 'Selasi Agbeko', byType: 'human', date: '18 Nov' }
  ];

  D.orders = [
    { id: 'ORD-10482', customer: 'c1', date: 'Today, 14:20', items: [['p3', 12], ['p9', 6]], status: 'Processing', pay: 'Unpaid', by: 'e4', channel: 'whatsapp' },
    { id: 'ORD-10481', customer: 'c12', date: 'Today, 12:51', items: [['p5', 8], ['p3', 10]], status: 'Confirmed', pay: 'Paid', by: 'e3', channel: 'email' },
    { id: 'ORD-10480', customer: 'c6', date: 'Today, 11:37', items: [['p7', 1]], status: 'Delivered', pay: 'Paid', by: 'e4', channel: 'webchat' },
    { id: 'ORD-10479', customer: 'c4', date: 'Today, 11:02', items: [['p6', 2], ['p4', 1]], status: 'Processing', pay: 'Partially paid', by: 'e3', channel: 'email' },
    { id: 'ORD-10478', customer: 'c5', date: 'Today, 09:18', items: [['p8', 6], ['p10', 10], ['p9', 4]], status: 'Draft', pay: 'Unpaid', by: 'e4', channel: 'whatsapp', aiDraft: true },
    { id: 'ORD-10477', customer: 'c2', date: 'Yesterday, 17:40', items: [['p2', 3], ['p1', 3]], status: 'Out for delivery', pay: 'Paid', by: 'e3', channel: 'whatsapp' },
    { id: 'ORD-10476', customer: 'c10', date: 'Yesterday, 15:05', items: [['p12', 2], ['p8', 2]], status: 'Delivered', pay: 'Paid', by: 'e3', channel: 'telegram' },
    { id: 'ORD-10475', customer: 'c7', date: 'Yesterday, 10:22', items: [['p7', 12]], status: 'Delivered', pay: 'Paid', by: 'e3', channel: 'instagram' },
    { id: 'ORD-10474', customer: 'c3', date: '22 Nov, 16:48', items: [['p9', 2], ['p10', 1]], status: 'Cancelled', pay: 'Refunded', by: 'e4', channel: 'webchat' },
    { id: 'ORD-10473', customer: 'c8', date: '22 Nov, 13:31', items: [['p11', 1], ['p6', 1]], status: 'Delivered', pay: 'Paid', by: 'e4', channel: 'email' },
    { id: 'ORD-10472', customer: 'c11', date: '21 Nov, 11:12', items: [['p3', 2]], status: 'Delivered', pay: 'Paid', by: 'e4', channel: 'whatsapp' },
    { id: 'ORD-10471', customer: 'c1', date: '21 Nov, 09:55', items: [['p1', 4]], status: 'Delivered', pay: 'Paid', by: 'e4', channel: 'whatsapp' }
  ];

  D.leads = [
    { id: 'l1', name: 'Ridge Hospital procurement', contact: 'Dr. Agyemang', value: 84000, stage: 'Qualified', owner: 'e3', next: 'Send quotation by Thu', source: 'Email' },
    { id: 'l2', name: 'Osu Co-op Credit Union', contact: 'Mercy Laryea', value: 26500, stage: 'Proposal', owner: 'e4', next: 'Follow-up call Fri 10:00', source: 'Website chat' },
    { id: 'l3', name: 'GreenLeaf Hotel', contact: 'Daniel Quartey', value: 41200, stage: 'Contacted', owner: 'e3', next: 'Site visit next week', source: 'Referral' },
    { id: 'l4', name: 'Bright Future Academy', contact: 'Mrs. Ofori', value: 18300, stage: 'New', owner: 'e4', next: 'First contact', source: 'WhatsApp' },
    { id: 'l5', name: 'Tamale Agro Traders', contact: 'Alhassan Musah', value: 12800, stage: 'New', owner: 'e10', next: 'First contact', source: 'Telegram' },
    { id: 'l6', name: 'Accra Mall kiosk fit-out', contact: 'Rita Boadu', value: 9700, stage: 'Contacted', owner: 'e4', next: 'Send catalogue', source: 'Instagram' },
    { id: 'l7', name: 'Volta River Authority branch', contact: 'Eric Doe', value: 63000, stage: 'Proposal', owner: 'e3', next: 'Awaiting tender result', source: 'Email' },
    { id: 'l8', name: 'Kpodo Co-working expansion', contact: 'Edem Kpodo', value: 15600, stage: 'Won', owner: 'e3', next: 'Converted to ORD-10476', source: 'Telegram' },
    { id: 'l9', name: 'Sunrise Bakery', contact: 'Comfort Adjei', value: 4200, stage: 'Lost', owner: 'e4', next: 'Chose cheaper supplier', source: 'Website chat' },
    { id: 'l10', name: 'Legon Hall office refresh', contact: 'Prof. Mensah', value: 37400, stage: 'Qualified', owner: 'e4', next: 'Confirm quantities', source: 'Email', ai: true }
  ];
  D.stages = ['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'];

  D.invoices = [
    { id: 'INV-2611', customer: 'c4', order: 'ORD-10479', issued: '24 Nov 2026', due: '24 Dec 2026', total: 7030, paid: 4000, status: 'Partially paid' },
    { id: 'INV-2610', customer: 'c1', order: 'ORD-10482', issued: '24 Nov 2026', due: '1 Dec 2026', total: 3990, paid: 0, status: 'Sent' },
    { id: 'INV-2609', customer: 'c12', order: 'ORD-10481', issued: '24 Nov 2026', due: '8 Dec 2026', total: 8370, paid: 8370, status: 'Paid' },
    { id: 'INV-2604', customer: 'c5', order: 'ORD-10466', issued: '28 Oct 2026', due: '27 Nov 2026', total: 22480, paid: 0, status: 'Sent' },
    { id: 'INV-2598', customer: 'c8', order: 'ORD-10451', issued: '15 Oct 2026', due: '14 Nov 2026', total: 7300, paid: 2000, status: 'Overdue' },
    { id: 'INV-2595', customer: 'c7', order: 'ORD-10447', issued: '10 Oct 2026', due: '9 Nov 2026', total: 5480, paid: 0, status: 'Overdue' },
    { id: 'INV-2590', customer: 'c2', order: 'ORD-10440', issued: '2 Oct 2026', due: '1 Nov 2026', total: 10650, paid: 10650, status: 'Paid' },
    { id: 'INV-2587', customer: 'c10', order: '', issued: '29 Sep 2026', due: '29 Oct 2026', total: 3400, paid: 3400, status: 'Paid' }
  ];

  D.payments = [
    { id: 'PAY-8841', invoice: 'INV-2609', customer: 'c12', amount: 8370, method: 'MTN Mobile Money', when: 'Today, 13:02', verified: true, provider: 'Paystack', ref: 'PSK_9f2a71c', by: 'System' },
    { id: 'PAY-8840', invoice: 'INV-2611', customer: 'c4', amount: 4000, method: 'Bank transfer', when: 'Today, 11:40', verified: false, provider: '', ref: 'GCB slip 00419', by: 'Abena Owusu' },
    { id: 'PAY-8839', invoice: 'INV-2598', customer: 'c8', amount: 2000, method: 'Cash', when: '20 Nov, 15:12', verified: false, provider: '', ref: 'Receipt 3318', by: 'Abena Owusu' },
    { id: 'PAY-8838', invoice: 'INV-2590', customer: 'c2', amount: 10650, method: 'Card', when: '30 Oct, 10:05', verified: true, provider: 'Paystack', ref: 'PSK_77bd010', by: 'System' },
    { id: 'PAY-8837', invoice: 'INV-2587', customer: 'c10', amount: 3400, method: 'Telecel Cash', when: '27 Oct, 09:44', verified: true, provider: 'Hubtel', ref: 'HBT_4410923', by: 'System' }
  ];

  D.expenses = [
    { id: 'EXP-512', date: '24 Nov', cat: 'Transport and delivery', desc: 'Fuel for delivery van GT 4471-22', amount: 820, by: 'e7', status: 'Approved' },
    { id: 'EXP-511', date: '23 Nov', cat: 'Utilities', desc: 'ECG prepaid top-up, showroom', amount: 1500, by: 'e2', status: 'Approved' },
    { id: 'EXP-510', date: '22 Nov', cat: 'Salaries and wages', desc: 'Casual loaders, week 47', amount: 2400, by: 'e7', status: 'Approved' },
    { id: 'EXP-509', date: '21 Nov', cat: 'Marketing', desc: 'Instagram promotion, November', amount: 1200, by: 'e3', status: 'Pending approval' },
    { id: 'EXP-508', date: '19 Nov', cat: 'Rent', desc: 'Warehouse rent, Spintex, December', amount: 9500, by: 'e2', status: 'Approved' },
    { id: 'EXP-507', date: '18 Nov', cat: 'Internet and software', desc: 'Fibre broadband, November', amount: 650, by: 'e2', status: 'Approved' }
  ];

  D.tasks = [
    { id: 't1', title: 'Prepare quotation for Ridge Hospital', desc: '40 chairs, 12 desks, 6 filing cabinets. Include delivery to Ridge.', who: 'e3', due: '26 Nov', prio: 3, status: 'In progress', dept: 'd2' },
    { id: 't2', title: 'Call Appiah Clinic about overdue invoice INV-2598', desc: 'Balance GHS 5,300. Agree on a payment date.', who: 'e9', due: '21 Nov', prio: 4, status: 'To do', dept: 'd5', overdue: true },
    { id: 't3', title: 'Receive UPS shipment from TechSource', desc: 'PR-0220, 10 units. Check serial numbers.', who: 'e8', due: '27 Nov', prio: 2, status: 'To do', dept: 'd4' },
    { id: 't4', title: 'Review AI drafted order for Darko Schools', desc: 'ORD-10478 prepared by Sales Agent from WhatsApp chat.', who: 'e4', due: 'Today', prio: 3, status: 'To do', dept: 'd2', fromAgent: 'Sales Agent' },
    { id: 't5', title: 'Update product photos for appliances', desc: '', who: 'e8', due: '29 Nov', prio: 1, status: 'In progress', dept: 'd4' },
    { id: 't6', title: 'Reconcile Mobile Money settlements, week 47', desc: '', who: 'e9', due: '25 Nov', prio: 2, status: 'In review', dept: 'd5' },
    { id: 't7', title: 'Follow up with Frimpong Events on overdue invoice', desc: 'INV-2595, GHS 5,480.', who: 'e4', due: '20 Nov', prio: 3, status: 'To do', dept: 'd2', overdue: true, fromAgent: 'Finance Assistant' },
    { id: 't8', title: 'Onboard Fiifi Ansah to Sales', desc: 'Accounts, product training, shadowing.', who: 'e3', due: '28 Nov', prio: 2, status: 'To do', dept: 'd2' },
    { id: 't9', title: 'Stock count, stationery aisle', desc: '', who: 'e8', due: '22 Nov', prio: 2, status: 'Done', dept: 'd4' },
    { id: 't10', title: 'Close resolved support conversations older than 7 days', desc: '', who: 'e6', due: '23 Nov', prio: 1, status: 'Done', dept: 'd3' }
  ];

  D.conversations = [
    {
      id: 'v1', customer: 'c5', channel: 'whatsapp', status: 'Open', prio: 3, cat: 'Order enquiry', handler: 'ai', agent: 'Sales Agent', assignee: 'e4', unread: true, time: '14:31',
      messages: [
        { dir: 'in', text: 'Good afternoon. This is the bursar at Darko Schools. We need 6 whiteboards, 10 packs of box files and 4 packs of blue pens for the new term.', at: '14:02' },
        { dir: 'trace', text: 'products.search("whiteboard", "box files", "pens") and inventory.check_availability' },
        { dir: 'out', ai: true, text: 'Good afternoon, and thank you for reaching out. All three items are in stock:\n\nWhiteboard 120 x 90 cm, 6 at GHS 760 each\nBox files (pack of 12), 10 packs at GHS 180 each\nBallpoint pens blue (pack of 50), 4 packs at GHS 95 each\n\nShall I prepare an order for you to confirm?', at: '14:03', status: 'read' },
        { dir: 'in', text: 'Yes please. Can we pay 50% now and the rest after delivery? Also can you deliver to Koforidua by Friday?', at: '14:29' },
        { dir: 'event', text: 'Sales Agent prepared draft order ORD-10478 for review' },
        { dir: 'event', text: 'Sales Agent escalated: payment terms and delivery date need a person to confirm' }
      ],
      draft: 'Thank you. I have prepared order ORD-10478 for GHS 6,740.00 (final total confirmed on the invoice). A colleague will confirm the split payment terms and the Friday delivery to Koforidua shortly.'
    },
    {
      id: 'v2', customer: 'c1', channel: 'whatsapp', status: 'Open', prio: 2, cat: 'Order enquiry', handler: 'human', assignee: 'e4', unread: false, time: '14:20',
      messages: [
        { dir: 'in', text: 'Esi, please add 12 boxes of A4 and 6 packs of pens to our usual order.', at: '13:58' },
        { dir: 'event', text: 'Esi Quaye took over from Customer Support Agent' },
        { dir: 'out', text: 'Done, Ama. Order ORD-10482 is created. I will send the invoice now.', at: '14:20', status: 'delivered', by: 'e4' }
      ]
    },
    {
      id: 'v3', customer: 'c6', channel: 'webchat', status: 'Open', prio: 1, cat: 'Product question', handler: 'ai', agent: 'Customer Support Agent', assignee: null, unread: true, time: '13:47',
      messages: [
        { dir: 'in', text: 'Does the standing fan come with a warranty?', at: '13:46' },
        { dir: 'trace', text: 'products.get("FAN-STD-16") and policies.get("warranty")' },
        { dir: 'out', ai: true, text: 'Yes. The 16 inch standing fan comes with a 12 month manufacturer warranty. Keep your receipt and bring the fan to our Ring Road showroom if anything goes wrong.', at: '13:47', status: 'read' }
      ]
    },
    {
      id: 'v4', customer: 'c4', channel: 'email', status: 'Pending', prio: 3, cat: 'Payment', handler: 'human', assignee: 'e9', unread: false, time: '11:52',
      messages: [
        { dir: 'in', text: 'Subject: Part payment for ORD-10479\n\nHello, we have transferred GHS 4,000 to your GCB account as part payment. The slip is attached. Balance will follow on delivery.\n\nKofi Asante\nAsante Logistics', at: '11:30', attach: 'GCB_slip_00419.pdf' },
        { dir: 'note', text: 'Recorded manually as PAY-8840. Not yet visible on the bank statement, so marked unverified. Abena', at: '11:41' },
        { dir: 'out', text: 'Thank you, Kofi. We have recorded your transfer of GHS 4,000 against INV-2611 and will confirm once it reflects in our account.', at: '11:52', status: 'delivered', by: 'e9' }
      ]
    },
    {
      id: 'v5', customer: 'c10', channel: 'telegram', status: 'Open', prio: 2, cat: 'Delivery', handler: 'ai', agent: 'Customer Support Agent', assignee: null, unread: false, time: '10:15',
      messages: [
        { dir: 'in', text: 'When will the remaining whiteboards arrive?', at: '10:12' },
        { dir: 'trace', text: 'orders.get("ORD-10476") returned status Delivered, no pending items' },
        { dir: 'out', ai: true, text: 'Our records show order ORD-10476 (2 filing cabinets and 2 whiteboards) was delivered in full yesterday. If you are expecting more items, could you share the order number so I can check?', at: '10:13', status: 'read' }
      ]
    },
    {
      id: 'v6', customer: 'c7', channel: 'instagram', status: 'Open', prio: 4, cat: 'Complaint', handler: 'ai', agent: 'Customer Support Agent', assignee: 'e6', unread: true, time: '09:58', escalated: true,
      messages: [
        { dir: 'in', text: 'Two of the fans you delivered are not working. We have an event tomorrow. I want a refund for those two now.', at: '09:55' },
        { dir: 'out', ai: true, text: 'I am sorry about this, Akosua. I have passed this to our support team with priority. Refunds need to be approved by a team member, and someone will contact you within the hour.', at: '09:56', status: 'read' },
        { dir: 'event', text: 'Escalated to Akua Asantewaa: refund request requires human approval' }
      ]
    },
    {
      id: 'v7', customer: 'c2', channel: 'messenger', status: 'Resolved', prio: 1, cat: 'Delivery', handler: 'human', assignee: 'e6', unread: false, time: 'Yesterday',
      messages: [
        { dir: 'in', text: 'Is the delivery still coming today?', at: '16:02' },
        { dir: 'out', text: 'Yes, the van left at 15:30. Driver will call on arrival.', at: '16:05', status: 'read', by: 'e6' }
      ]
    },
    {
      id: 'v8', customer: 'c12', channel: 'email', status: 'Resolved', prio: 1, cat: 'Invoice', handler: 'human', assignee: 'e9', unread: false, time: 'Yesterday',
      messages: [
        { dir: 'in', text: 'Please resend invoice INV-2609 with our TIN on it.', at: '09:30' },
        { dir: 'out', text: 'Resent with TIN TIN-REDACTED included.', at: '10:02', status: 'read', by: 'e9' }
      ]
    }
  ];

  D.agents = [
    { id: 'support', name: 'Customer Support Agent', short: 'CS', desc: 'Answers customer enquiries using product, order and policy records. Escalates what it cannot resolve.', on: true, level: 'execute', runs: 412, success: 96.4, escal: 18, usage: 61,
      duties: ['Respond to customer enquiries', 'Retrieve permitted customer and product information', 'Categorise conversations', 'Escalate unresolved enquiries', 'Prepare responses for human review where necessary'],
      tools: [['products.search', 'Read product catalogue', true], ['inventory.check_availability', 'Read stock levels', true], ['orders.get', 'Read order status', true], ['customers.get', 'Read customer profile', true], ['conversations.reply', 'Send replies in assigned channels', true], ['conversations.categorise', 'Set category and priority', true], ['orders.create_draft', 'Prepare draft orders', false]],
      locked: ['Issue refunds', 'Confirm payments', 'Change prices'] },
    { id: 'sales', name: 'Sales Agent', short: 'SA', desc: 'Handles product enquiries, spots opportunities and prepares follow-ups and draft orders.', on: true, level: 'approve', runs: 186, success: 93.0, escal: 22, usage: 38,
      duties: ['Assist with product enquiries', 'Identify potential sales opportunities', 'Prepare follow-up messages', 'Assist with lead categorisation', 'Prepare order drafts where authorised'],
      tools: [['products.search', 'Read product catalogue', true], ['leads.update_stage', 'Suggest lead stage changes', true], ['orders.create_draft', 'Prepare draft orders', true], ['conversations.reply', 'Send replies in assigned channels', true], ['customers.create', 'Create customer records', false]],
      locked: ['Apply discounts above 5%', 'Confirm orders', 'Confirm payments'] },
    { id: 'inventory', name: 'Inventory Agent', short: 'IN', desc: 'Watches stock levels, summarises movement and prepares purchase requests.', on: true, level: 'approve', runs: 94, success: 98.9, escal: 3, usage: 12,
      duties: ['Monitor inventory information', 'Identify low-stock products', 'Summarise stock movement', 'Prepare purchase requests', 'Report stock anomalies for review'],
      tools: [['inventory.list', 'Read stock levels', true], ['movements.list', 'Read stock movements', true], ['purchase_requests.create_draft', 'Prepare purchase requests', true], ['suppliers.get', 'Read supplier records', true]],
      locked: ['Adjust stock quantities', 'Send purchase orders to suppliers'] },
    { id: 'finance', name: 'Finance Assistant', short: 'FI', desc: 'Summarises financial records, tracks outstanding balances and flags unusual activity.', on: true, level: 'suggest', runs: 57, success: 100, escal: 6, usage: 9,
      duties: ['Summarise authorised financial records', 'Assist with invoice enquiries', 'Identify outstanding balances', 'Prepare financial summaries', 'Flag unusual financial activity'],
      tools: [['invoices.list', 'Read invoices', true], ['payments.list', 'Read payments and verification state', true], ['expenses.list', 'Read expenses', true], ['reminders.prepare', 'Prepare payment reminders', true]],
      locked: ['Record or confirm payments', 'Edit invoices', 'Issue refunds'] },
    { id: 'ops', name: 'Operations Assistant', short: 'OP', desc: 'Summarises daily activity, tracks task progress and escalates overdue work.', on: true, level: 'approve', runs: 73, success: 97.3, escal: 9, usage: 8,
      duties: ['Summarise business activities', 'Monitor task progress', 'Identify operational bottlenecks', 'Prepare task recommendations', 'Escalate overdue activities'],
      tools: [['tasks.list', 'Read tasks', true], ['tasks.create', 'Create tasks', true], ['notifications.send', 'Notify employees', true], ['audit.read_summary', 'Read activity summary', false]],
      locked: ['Change employee permissions', 'Deactivate accounts'] },
    { id: 'analyst', name: 'Business Analyst', short: 'BA', desc: 'Answers business questions from recorded data and produces performance summaries.', on: false, level: 'suggest', runs: 0, success: 0, escal: 0, usage: 0,
      duties: ['Analyse available business information', 'Produce performance summaries', 'Identify trends and anomalies', 'Generate management insights', 'Answer authorised business questions using recorded data'],
      tools: [['analytics.query', 'Read aggregated metrics', true], ['orders.list', 'Read orders', true], ['invoices.list', 'Read invoices', false]],
      locked: ['Modify any record'] }
  ];

  D.approvals = [
    { id: 'APR-301', kind: 'Refund', requester: 'Customer Support Agent', requesterType: 'ai', op: 'Refund GHS 1,080 for 2 faulty standing fans', record: 'ORD-10475 (Frimpong Events)', reason: 'Customer reports 2 of 12 fans not working on delivery. Event tomorrow.', status: 'Pending', when: '09:56', risk: 'High' },
    { id: 'APR-300', kind: 'Purchase request', requester: 'Inventory Agent', requesterType: 'ai', op: 'Send PR-0221 to Accra Paper Mart: 80 boxes A4 paper, GHS 16,800', record: 'PR-0221', reason: 'Stock at 3 boxes against threshold of 40. 140 sold in last 30 days.', status: 'Pending', when: '08:10', risk: 'Medium' },
    { id: 'APR-299', kind: 'Order confirmation', requester: 'Sales Agent', requesterType: 'ai', op: 'Confirm draft order ORD-10478 with 50% deposit terms', record: 'ORD-10478 (Darko Schools Complex)', reason: 'Customer requested split payment and Friday delivery.', status: 'Pending', when: '14:30', risk: 'Medium' },
    { id: 'APR-298', kind: 'Expense', requester: 'Kofi Mensah', requesterType: 'human', op: 'Approve marketing expense GHS 1,200', record: 'EXP-509', reason: 'Instagram promotion for end of year sales.', status: 'Pending', when: 'Yesterday', risk: 'Low' },
    { id: 'APR-297', kind: 'Permission change', requester: 'Adwoa Sarpong', requesterType: 'human', op: 'Grant Finance role to Kofi Mensah', record: 'Employee: Kofi Mensah', reason: 'Cover for Abena during leave in December.', status: 'Approved', when: '22 Nov', risk: 'High', reviewer: 'Owner Example', decided: '22 Nov, 17:04', result: 'Executed' },
    { id: 'APR-296', kind: 'Discount', requester: 'Sales Agent', requesterType: 'ai', op: 'Apply 8% discount on ORD-10473', record: 'ORD-10473 (Appiah Clinic)', reason: 'Customer asked for loyalty discount.', status: 'Rejected', when: '22 Nov', risk: 'Medium', reviewer: 'Kofi Mensah', decided: '22 Nov, 13:20', result: 'Not executed' }
  ];

  D.workflows = [
    { id: 'w1', name: 'Low stock to purchase request', on: true, trigger: 'Stock threshold reached', conds: [['Stock quantity', 'is below', 'threshold']], actions: ['Trigger Inventory Agent: prepare purchase request', 'Prepare approval request for Department manager'], runs: 38, ok: 37, last: 'Today, 08:10', approval: true },
    { id: 'w2', name: 'New WhatsApp enquiry routing', on: true, trigger: 'New message received', conds: [['Channel', 'is', 'WhatsApp'], ['Message category', 'is', 'Order enquiry']], actions: ['Trigger Sales Agent', 'Assign conversation to Sales team'], runs: 412, ok: 409, last: 'Today, 14:02', approval: false },
    { id: 'w3', name: 'Overdue invoice reminder', on: true, trigger: 'Scheduled event: daily 08:00', conds: [['Invoice status', 'is', 'Overdue']], actions: ['Trigger Finance Assistant: prepare reminder', 'Create a task for account owner'], runs: 22, ok: 20, last: 'Today, 08:00', approval: true },
    { id: 'w4', name: 'Large order alert', on: true, trigger: 'New order created', conds: [['Order value', 'is above', 'GHS 20,000']], actions: ['Send notification to Business owner', 'Create a task: credit check'], runs: 6, ok: 6, last: '18 Nov', approval: false },
    { id: 'w5', name: 'Payment received thank you', on: false, trigger: 'Payment status changed', conds: [['Payment', 'is', 'Verified by provider']], actions: ['Send authorised message in original channel'], runs: 0, ok: 0, last: 'Never', approval: false },
    { id: 'w6', name: 'Task deadline escalation', on: true, trigger: 'Task deadline reached', conds: [['Task status', 'is not', 'Done']], actions: ['Trigger Operations Assistant', 'Notify department manager'], runs: 51, ok: 49, last: 'Yesterday, 18:00', approval: false }
  ];

  D.executions = [
    { id: 'x1', wf: 'w2', when: 'Today, 14:02', result: 'Succeeded', dur: '1.8 s', detail: 'Conversation with Darko Schools routed to Sales Agent' },
    { id: 'x2', wf: 'w1', when: 'Today, 08:10', result: 'Waiting for approval', dur: '4.1 s', detail: 'PR-0221 prepared, APR-300 created' },
    { id: 'x3', wf: 'w3', when: 'Today, 08:00', result: 'Failed', dur: '30.0 s', detail: 'Email provider timeout sending reminder for INV-2595. Retry 2 of 3 scheduled 14:00.' },
    { id: 'x4', wf: 'w3', when: 'Today, 08:00', result: 'Succeeded', dur: '2.2 s', detail: 'Reminder prepared for INV-2598, task created for Abena Owusu' },
    { id: 'x5', wf: 'w6', when: 'Yesterday, 18:00', result: 'Succeeded', dur: '0.9 s', detail: 'Escalated 2 overdue tasks' },
    { id: 'x6', wf: 'w2', when: 'Yesterday, 16:40', result: 'Skipped', dur: '0.1 s', detail: 'Duplicate event ignored (idempotency key msg_88213)' }
  ];

  D.integrations = [
    { id: 'whatsapp', name: 'WhatsApp Business Platform', cat: 'Communication', status: 'connected', detail: '+233 30 000 0000', sync: '2 min ago' },
    { id: 'email', name: 'Email (Google Workspace)', cat: 'Communication', status: 'connected', detail: 'hello@example.test', sync: '1 min ago' },
    { id: 'webchat', name: 'Website live chat', cat: 'Communication', status: 'connected', detail: 'example.test', sync: 'Live' },
    { id: 'telegram', name: 'Telegram', cat: 'Communication', status: 'connected', detail: '@example_bot', sync: '5 min ago' },
    { id: 'instagram', name: 'Instagram messaging', cat: 'Communication', status: 'error', detail: 'Access token expired 23 Nov', sync: '1 day ago' },
    { id: 'messenger', name: 'Facebook Messenger', cat: 'Communication', status: 'connected', detail: 'Adom Home & Office', sync: '9 min ago' },
    { id: 'paystack', name: 'Paystack', cat: 'Payments', status: 'connected', detail: 'Live mode, card and Mobile Money', sync: '4 min ago' },
    { id: 'hubtel', name: 'Hubtel', cat: 'Payments', status: 'connected', detail: 'Mobile Money collections', sync: '11 min ago' },
    { id: 'quickbooks', name: 'QuickBooks Online', cat: 'Accounting', status: 'off', detail: 'Optional. Nexora finance works without it.', sync: '' },
    { id: 'gdrive', name: 'Google Drive', cat: 'File storage', status: 'off', detail: 'Attach files from Drive', sync: '' },
    { id: 'smtp', name: 'Transactional email', cat: 'Email delivery', status: 'connected', detail: 'Invoices and reminders', sync: 'Live' }
  ];

  D.notifications = [
    { id: 'n1', type: 'approval', title: 'Refund needs your approval', body: 'Customer Support Agent requests GHS 1,080 refund for Frimpong Events.', when: '09:56', unread: true, go: '#/agents/approvals' },
    { id: 'n2', type: 'stock', title: 'A4 paper is below threshold', body: '3 boxes left. Threshold is 40.', when: '08:10', unread: true, go: '#/inventory' },
    { id: 'n3', type: 'workflow', title: 'Workflow failed: Overdue invoice reminder', body: 'Email provider timeout. Retry scheduled at 14:00.', when: '08:00', unread: true, go: '#/automation' },
    { id: 'n4', type: 'message', title: 'New WhatsApp message from Darko Schools', body: 'Escalated by Sales Agent.', when: '14:29', unread: true, go: '#/inbox/v1' },
    { id: 'n5', type: 'integration', title: 'Instagram connection needs attention', body: 'Reconnect to keep receiving Instagram messages.', when: 'Yesterday', unread: false, go: '#/integrations' },
    { id: 'n6', type: 'task', title: 'Task overdue: Call Appiah Clinic', body: 'Assigned to Abena Owusu, due 21 Nov.', when: 'Yesterday', unread: false, go: '#/tasks' }
  ];

  D.audit = [
    { when: '24 Nov 2026, 14:30:12', actor: 'Sales Agent', type: 'AI agent', action: 'Created draft order', res: 'ORD-10478', result: 'Success', approval: 'APR-299' },
    { when: '24 Nov 2026, 14:20:41', actor: 'Esi Quaye', type: 'Employee', action: 'Created order', res: 'ORD-10482', result: 'Success', approval: '' },
    { when: '24 Nov 2026, 14:19:03', actor: 'Esi Quaye', type: 'Employee', action: 'Took over conversation from AI', res: 'Conversation v2', result: 'Success', approval: '' },
    { when: '24 Nov 2026, 13:02:55', actor: 'Paystack', type: 'Integration', action: 'Verified payment', res: 'PAY-8841', result: 'Success', approval: '' },
    { when: '24 Nov 2026, 11:41:20', actor: 'Abena Owusu', type: 'Employee', action: 'Recorded manual payment', res: 'PAY-8840', result: 'Success', approval: '' },
    { when: '24 Nov 2026, 09:56:30', actor: 'Customer Support Agent', type: 'AI agent', action: 'Requested refund', res: 'ORD-10475', result: 'Awaiting approval', approval: 'APR-301' },
    { when: '24 Nov 2026, 08:10:04', actor: 'Low stock to purchase request', type: 'Workflow', action: 'Executed workflow', res: 'PR-0221', result: 'Awaiting approval', approval: 'APR-300' },
    { when: '24 Nov 2026, 08:00:30', actor: 'Overdue invoice reminder', type: 'Workflow', action: 'Executed workflow', res: 'INV-2595', result: 'Failed', approval: '' },
    { when: '24 Nov 2026, 07:58:11', actor: 'Owner Example', type: 'Employee', action: 'Signed in (macOS app)', res: 'Session s_81f2', result: 'Success', approval: '' },
    { when: '23 Nov 2026, 18:22:47', actor: 'Unknown', type: 'Employee', action: 'Failed sign-in attempt', res: 'mawuli@example.test', result: 'Denied', approval: '' },
    { when: '22 Nov 2026, 17:04:09', actor: 'Owner Example', type: 'Employee', action: 'Approved permission change', res: 'Kofi Mensah', result: 'Success', approval: 'APR-297' },
    { when: '22 Nov 2026, 13:20:15', actor: 'Kofi Mensah', type: 'Employee', action: 'Rejected discount request', res: 'ORD-10473', result: 'Success', approval: 'APR-296' }
  ];

  D.sessions = [
    { device: 'macOS app 1.4.2', where: 'Accra, GH', when: 'Current session', current: true, icon: 'monitor' },
    { device: 'Chrome on Windows', where: 'Accra, GH', when: 'Active 2 hours ago', icon: 'globe' },
    { device: 'Windows app 1.4.2', where: 'Tema, GH', when: 'Active yesterday', icon: 'monitor' }
  ];

  // 30 days of sales, GHS, ending today (24 Nov)
  D.sales30 = [18200, 22400, 19800, 25100, 14200, 9100, 21800, 24300, 26900, 23100, 28400, 12100, 8600, 25600, 27300, 24800, 30200, 29400, 13400, 10200, 28800, 31500, 27900, 33100, 34600, 15800, 11900, 32400, 30800, 36200];
  D.sales30prev = [17100, 19900, 18300, 21000, 13100, 8800, 20100, 21500, 22300, 21900, 24400, 11800, 9200, 22000, 23600, 22100, 25300, 24800, 12200, 9800, 24100, 26400, 25200, 27800, 28100, 13900, 10800, 26600, 27200, 29100];
  D.salesByChannel = [['WhatsApp', 312400], ['Walk-in', 148900], ['Email', 121300], ['Website chat', 64200], ['Instagram', 38700], ['Telegram', 21500]];
  D.convVolume = [64, 71, 58, 80, 77, 42, 30, 69, 85, 74, 81, 90, 48, 36];
  D.aiHandled = [38, 44, 33, 51, 49, 30, 22, 45, 57, 49, 55, 62, 34, 26];

  // Helpers
  D.byId = function (list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; };
  D.customer = function (id) { return D.byId(D.customers, id); };
  D.employee = function (id) { return D.byId(D.employees, id); };
  D.product = function (id) { return D.byId(D.products, id); };
  D.dept = function (id) { return D.byId(D.departments, id); };
  D.role = function (id) { return D.byId(D.roles, id); };
  D.supplier = function (id) { return D.byId(D.suppliers, id); };
  D.orderTotal = function (o) { var t = 0; o.items.forEach(function (it) { t += D.product(it[0]).price * it[1]; }); return t; };

  window.NX = D;
})();
