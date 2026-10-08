-- Additive, idempotent migration. Existing MFA factors remain active.
alter table internal_users add column if not exists pending_totp_secret text;
alter table internal_users add column if not exists pending_totp_expires_at timestamptz;
alter table internal_users add column if not exists pending_totp_session_hash text;
create table if not exists security_rate_limits (
  bucket text primary key,
  hits integer not null,
  expires_at timestamptz not null
);
create index if not exists idx_security_rate_expiry on security_rate_limits(expires_at);
