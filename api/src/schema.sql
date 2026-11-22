-- Aisty Free schema. Applied idempotently at boot under an advisory lock.

-- One workspace per deployment.
CREATE TABLE IF NOT EXISTS companies (
  id          uuid PRIMARY KEY,
  owner_id    text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  ticket_id   text PRIMARY KEY,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  position    integer NOT NULL DEFAULT 0,
  data        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tickets_company_idx ON tickets (company_id, position);

CREATE TABLE IF NOT EXISTS team_members (
  id                 uuid PRIMARY KEY,
  company_id         uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id            text,
  email              text NOT NULL,
  role               text NOT NULL CHECK (role IN ('owner','admin','member','billing','viewer')),
  status             text NOT NULL CHECK (status IN ('invited','active','removed','declined')),
  invite_token_hash  text,
  invite_expires_at  timestamptz,
  invited_at         timestamptz NOT NULL DEFAULT now(),
  activated_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS team_members_user_idx ON team_members (company_id, user_id) WHERE user_id IS NOT NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS team_members_email_idx ON team_members (company_id, lower(email));

-- Integration credentials, sealed with MASTER_KEY and bound to their row.
CREATE TABLE IF NOT EXISTS integrations (
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider     text NOT NULL,
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  sealed       text NOT NULL,
  connected_by text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, provider)
);

CREATE TABLE IF NOT EXISTS model_config (
  company_id   uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  provider     text NOT NULL,
  base_url     text,
  model        text NOT NULL,
  sealed_key   text,
  updated_by   text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- A plan the agent is holding for a person to decide.
CREATE TABLE IF NOT EXISTS approvals (
  approval_id  text PRIMARY KEY,
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ticket_id    text NOT NULL,
  status       text NOT NULL CHECK (status IN ('pending','approved','declined','revised','expired')),
  risk         text NOT NULL,
  plan         text NOT NULL,          -- sealed JSON: actions + their exact arguments
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  decided_by   text,
  note         text
);
CREATE INDEX IF NOT EXISTS approvals_ticket_idx ON approvals (company_id, ticket_id);

-- Work queue. Postgres is the queue: claimed with FOR UPDATE SKIP LOCKED.
CREATE TABLE IF NOT EXISTS jobs (
  id           uuid PRIMARY KEY,
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('plan','execute','suggest')),
  ticket_id    text,
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','complete','failed','cancelled')),
  payload      text,                    -- sealed JSON
  result       text,                    -- sealed JSON
  error        text,
  attempts     integer NOT NULL DEFAULT 0,
  lease_until  timestamptz,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_queue_idx ON jobs (status, created_at);
CREATE INDEX IF NOT EXISTS jobs_ticket_idx ON jobs (company_id, ticket_id);

CREATE TABLE IF NOT EXISTS session_cache (
  token_hash  text PRIMARY KEY,
  user_id     text NOT NULL,
  email       text,
  expires_at  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);

-- Append-only audit log.
CREATE TABLE IF NOT EXISTS audit_log (
  seq             bigserial PRIMARY KEY,
  id              uuid NOT NULL UNIQUE,
  company_id      uuid,
  user_id         text,
  user_email      text,
  workspace_role  text,
  method          text,
  action          text NOT NULL,
  resource        text,
  resource_id     text,
  path            text,
  status_code     integer,
  ip              text,
  user_agent      text,
  metadata        text,                -- sealed JSON
  created_at      timestamptz NOT NULL DEFAULT now(),
  prev_hash       text NOT NULL,
  hash            text NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_company_idx ON audit_log (company_id, created_at DESC);

CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_change ON audit_log;
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- Chat. Conversations are private to the person who started them.
CREATE TABLE IF NOT EXISTS chats (
  chat_id         text PRIMARY KEY,
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by      text NOT NULL,
  created_by_email text,
  title           text NOT NULL,
  parent_chat_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chats_owner_idx ON chats (company_id, created_by, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  message_id  text PRIMARY KEY,
  chat_id     text NOT NULL REFERENCES chats(chat_id) ON DELETE CASCADE,
  seq         bigserial,
  role        text NOT NULL CHECK (role IN ('user','assistant')),
  body        text NOT NULL,            -- sealed JSON: content, steps
  feedback    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_chat_idx ON chat_messages (chat_id, seq);
