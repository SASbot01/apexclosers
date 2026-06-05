-- 0004 · guiones (scripts) por cliente + resultados de llamada.

create extension if not exists pgcrypto;

create table if not exists scripts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null,
  client_id  uuid references clients(id) on delete cascade,
  content    jsonb not null default '{}'::jsonb,   -- { phases, objections, tonalities }
  updated_at timestamptz default now(),
  unique (client_id)
);

create table if not exists call_results (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null,
  client_id    uuid references clients(id) on delete cascade,
  lead_id      uuid,
  call_id      uuid references calls(id),   -- enlazará con la transcripción cuando se automatice
  outcome      text,                         -- won|follow_up|lost|no_show
  notes        text,
  duration_min int,
  created_at   timestamptz default now()
);
create index if not exists call_results_client_idx on call_results (client_id, created_at desc);

alter table scripts enable row level security;
alter table call_results enable row level security;
drop policy if exists scripts_owner on scripts;
create policy scripts_owner on scripts for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists call_results_owner on call_results;
create policy call_results_owner on call_results for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
