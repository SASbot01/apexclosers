-- 0005 · leads (CRM, persistidos) + tokens de Google (para leer calendarios).
create extension if not exists pgcrypto;

create table if not exists leads (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null,
  client_id         uuid references clients(id) on delete set null,
  calendar_event_id text,                       -- evento de Google que lo creó
  name              text,
  email             text,
  phone             text,
  company           text,
  value             numeric,
  stage             text default 'agendada',
  source            text,
  tags              text[] default '{}',
  assignee          text,
  meeting_url       text,
  platform          text,                        -- google_meet | zoom | teams
  next_step         text,
  next_at           timestamptz,
  last_at           timestamptz,
  created_at        timestamptz default now(),
  unique (owner_id, calendar_event_id)           -- dedupe por evento → no se duplican leads
);
create index if not exists leads_owner_idx on leads (owner_id, last_at desc);
create index if not exists leads_client_idx on leads (client_id);

-- Tokens OAuth de Google por usuario (para leer su calendario + compartidos).
create table if not exists google_tokens (
  user_id       uuid primary key references users(id) on delete cascade,
  access_token  text,
  refresh_token text,
  expiry        timestamptz,
  updated_at    timestamptz default now()
);

alter table leads enable row level security;
drop policy if exists leads_owner on leads;
create policy leads_owner on leads for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
-- google_tokens: solo backend (service key). RLS on sin policy = nadie con anon key.
alter table google_tokens enable row level security;
