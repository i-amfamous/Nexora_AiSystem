-- Nexora SRS v2.0 PostgreSQL schema.
-- Idempotent migration: safe to apply repeatedly with `npm run migrate`.
-- Application tenants are identified by `business_id`; every business table is
-- protected by row-level security and requires nexora.business_id to be set.

BEGIN;

CREATE SCHEMA IF NOT EXISTS nexora;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nexora_app') THEN
    CREATE ROLE nexora_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nexora_service') THEN
    CREATE ROLE nexora_service NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public, nexora TO nexora_app, nexora_service;

CREATE OR REPLACE FUNCTION nexora.current_business_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('nexora.business_id', true), '');
$$;

CREATE OR REPLACE FUNCTION nexora.is_service() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('nexora.role', true), '') = 'service'
      OR pg_has_role(current_user, 'nexora_service', 'MEMBER');
$$;

CREATE OR REPLACE FUNCTION public.nexora_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.version := coalesce(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.nexora_audit_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are append-only and cannot be modified or deleted';
END;
$$;

CREATE OR REPLACE FUNCTION public.nexora_set_context(business text, role text DEFAULT 'app')
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('nexora.business_id', business, false),
         set_config('nexora.role', role, false);
$$;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE TABLE IF NOT EXISTS public.businesses (
  id text PRIMARY KEY,
  name text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.users (
  id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  email text NOT NULL,
  employee_id text,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  active boolean NOT NULL DEFAULT true,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (business_id, lower(email))
);

CREATE TABLE IF NOT EXISTS public.sessions (
  id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  employee_id text,
  token_hash text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL,
  ip text,
  user_agent text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.password_resets (
  id text PRIMARY KEY,
  business_id text REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id text REFERENCES public.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.idempotency (
  id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id text,
  method text NOT NULL,
  path text NOT NULL,
  client_key text NOT NULL,
  response jsonb NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jobs (
  id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  context jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  run_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text,
  last_error text,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_nonces (
  id text PRIMARY KEY,
  business_id text REFERENCES public.businesses(id) ON DELETE CASCADE,
  provider text NOT NULL,
  event_id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE TABLE IF NOT EXISTS public.metrics (
  id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  value jsonb NOT NULL DEFAULT '[]'::jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  actor_id text,
  actor_type text NOT NULL,
  action text NOT NULL,
  resource text,
  result text,
  approval_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversations (
  id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id text,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'Open',
  priority text,
  category text,
  mode text NOT NULL DEFAULT 'ai',
  assignee text,
  unread boolean NOT NULL DEFAULT false,
  last_at timestamptz,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.messages (
  id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  conversation_id text REFERENCES public.conversations(id) ON DELETE CASCADE,
  customer_id text,
  channel text NOT NULL,
  external_id text,
  direction text NOT NULL,
  text text,
  sent_by text,
  status text,
  delivery_status text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, channel, external_id)
);

CREATE TABLE IF NOT EXISTS public.products (
  id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL,
  price numeric(14, 2) NOT NULL DEFAULT 0,
  cost numeric(14, 2) NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  threshold integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (business_id, sku)
);

CREATE TABLE IF NOT EXISTS public.orders (
  id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id text,
  status text NOT NULL DEFAULT 'Confirmed',
  payment_status text NOT NULL DEFAULT 'Unpaid',
  total numeric(14, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GHS',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id text,
  order_id text,
  total numeric(14, 2) NOT NULL DEFAULT 0,
  paid numeric(14, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Unpaid',
  due_at date,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.file_records (
  id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  mime_type text NOT NULL,
  size bigint NOT NULL,
  storage_path text NOT NULL,
  uploaded_by text,
  conversation_id text,
  customer_id text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  table_name text;
  generic_tables text[] := ARRAY[
    'employees', 'departments', 'roles', 'permissions', 'user_roles', 'role_permissions',
    'customers', 'customer_identifiers', 'conversation_assignments', 'conversation_notes', 'customer_notes', 'message_attachments',
    'communication_channels', 'channel_connections', 'leads', 'sales_activities',
    'order_items', 'product_categories', 'inventory', 'stock_movements', 'suppliers',
    'purchase_requests', 'invoice_items', 'payments', 'expenses', 'expense_categories',
    'expense_categories_seed', 'tasks', 'workflows', 'workflow_triggers',
    'workflow_executions', 'workflow_approvals', 'agents', 'agent_configurations',
    'agent_permissions', 'agent_executions', 'agent_tool_executions', 'integrations',
    'notifications', 'approvals'
  ];
BEGIN
  FOREACH table_name IN ARRAY generic_tables LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
      id text PRIMARY KEY,
      business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
      data jsonb NOT NULL DEFAULT ''{}''::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      version integer NOT NULL DEFAULT 1
    )', table_name);
  END LOOP;
END $$;

-- Tenant-scoped generic tables.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'sessions', 'password_resets', 'idempotency', 'jobs', 'webhook_nonces', 'metrics',
    'audit_logs', 'conversations', 'messages', 'products', 'orders', 'invoices', 'file_records',
    'employees', 'departments', 'roles', 'permissions', 'user_roles', 'role_permissions',
    'customers', 'customer_identifiers', 'conversation_assignments', 'conversation_notes', 'customer_notes', 'message_attachments',
    'communication_channels', 'channel_connections', 'leads', 'sales_activities',
    'order_items', 'product_categories', 'inventory', 'stock_movements', 'suppliers',
    'purchase_requests', 'invoice_items', 'payments', 'expenses', 'expense_categories',
    'expense_categories_seed', 'tasks', 'workflows', 'workflow_triggers',
    'workflow_executions', 'workflow_approvals', 'agents', 'agent_configurations',
    'agent_permissions', 'agent_executions', 'agent_tool_executions', 'integrations',
    'notifications', 'approvals'
  ]::text[] LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (business_id, created_at DESC)', 'idx_' || table_name || '_tenant', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I USING gin (data)', 'idx_' || table_name || '_data', table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_select_' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (business_id = nexora.current_business_id() OR nexora.is_service())', 'tenant_select_' || table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_insert_' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (business_id = nexora.current_business_id() OR nexora.is_service())', 'tenant_insert_' || table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_update_' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (business_id = nexora.current_business_id() OR nexora.is_service()) WITH CHECK (business_id = nexora.current_business_id() OR nexora.is_service())', 'tenant_update_' || table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_delete_' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (business_id = nexora.current_business_id() OR nexora.is_service())', 'tenant_delete_' || table_name, table_name);

    IF EXISTS (SELECT FROM pg_attribute WHERE attrelid = ('public.' || quote_ident(table_name))::regclass AND attname = 'updated_at') THEN
      IF NOT EXISTS (SELECT FROM pg_trigger WHERE tgrelid = ('public.' || quote_ident(table_name))::regclass AND tgname = 'touch_' || table_name) THEN
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.nexora_touch_updated_at()', 'touch_' || table_name, table_name);
      END IF;
    END IF;
  END LOOP;
END $$;

-- Businesses use their own id as the tenant key.
CREATE INDEX IF NOT EXISTS idx_businesses_name ON public.businesses (lower(name));
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select_businesses ON public.businesses;
CREATE POLICY tenant_select_businesses ON public.businesses FOR SELECT USING (id = nexora.current_business_id() OR nexora.is_service());
DROP POLICY IF EXISTS tenant_insert_businesses ON public.businesses;
CREATE POLICY tenant_insert_businesses ON public.businesses FOR INSERT WITH CHECK (nexora.is_service());
DROP POLICY IF EXISTS tenant_update_businesses ON public.businesses;
CREATE POLICY tenant_update_businesses ON public.businesses FOR UPDATE USING (id = nexora.current_business_id() OR nexora.is_service()) WITH CHECK (id = nexora.current_business_id() OR nexora.is_service());
DROP POLICY IF EXISTS tenant_delete_businesses ON public.businesses;
CREATE POLICY tenant_delete_businesses ON public.businesses FOR DELETE USING (nexora.is_service());

-- Useful operational indexes.
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages (business_id, conversation_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_messages_external ON public.messages (business_id, external_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders (business_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices (business_id, customer_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments (business_id, (data->>'invoice'));
CREATE INDEX IF NOT EXISTS idx_jobs_due ON public.jobs (status, run_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.sessions (business_id, user_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs (business_id, actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_approval ON public.audit_logs (business_id, approval_id) WHERE approval_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexora_app, nexora_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexora_app, nexora_service;

-- Append-only audit guarantee: no ordinary role may rewrite history.
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM nexora_app, nexora_service;
DROP TRIGGER IF EXISTS audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.nexora_audit_immutable();

GRANT SELECT, INSERT ON public.audit_logs TO nexora_app, nexora_service;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexora_app, nexora_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nexora_app, nexora_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA nexora GRANT USAGE, SELECT ON FUNCTIONS TO nexora_app, nexora_service;

INSERT INTO public.schema_migrations (version, notes)
VALUES ('2.0.0', 'Initial SRS v2.0 tenant-isolated schema with RLS and append-only audit log')
ON CONFLICT (version) DO NOTHING;

COMMIT;
