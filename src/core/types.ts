export type CollectionName =
  | 'businesses' | 'users' | 'employees' | 'departments' | 'roles' | 'permissions' | 'userRoles' | 'rolePermissions'
  | 'customers' | 'customerIdentifiers' | 'conversations' | 'conversationAssignments' | 'conversationNotes' | 'customerNotes' | 'messages' | 'messageAttachments'
  | 'communicationChannels' | 'channelConnections'
  | 'leads' | 'salesActivities' | 'orders' | 'orderItems'
  | 'products' | 'productCategories' | 'inventory' | 'stockMovements' | 'suppliers' | 'purchaseRequests'
  | 'invoices' | 'invoiceItems' | 'payments' | 'expenses' | 'expenseCategories'
  | 'tasks' | 'workflows' | 'workflowTriggers' | 'workflowExecutions' | 'workflowApprovals'
  | 'agents' | 'agentConfigurations' | 'agentPermissions' | 'agentExecutions' | 'agentToolExecutions'
  | 'integrations' | 'notifications' | 'auditLogs' | 'fileRecords'
  | 'approvals' | 'sessions' | 'passwordResets' | 'idempotency' | 'jobs' | 'webhookNonces' | 'metrics'
  | 'expenseCategoriesSeed';

export interface BaseRecord {
  id: string;
  businessId?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface Context {
  userId: string;
  employeeId: string;
  businessId: string;
  role: string;
  sessionId: string;
  ip: string;
  userAgent: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  employeeId: string;
  businessId: string;
  role: string;
  status: string;
}

export interface ApiErrorShape {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export type AuditActorType = 'Employee' | 'AI agent' | 'Workflow' | 'Integration' | 'System';

export interface AuditInput {
  businessId?: string;
  action: string;
  resource: string;
  actorType: AuditActorType;
  actorId: string;
  result: string;
  approvalId?: string;
  meta?: Record<string, unknown>;
}

export interface WorkflowEvent {
  type: string;
  businessId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  eventId: string;
}
