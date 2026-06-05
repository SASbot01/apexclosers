-- 0003 · clientes (= proyectos) + conversaciones. Aislado por owner (el closer/agencia).

create extension if not exists pgcrypto;

create table if not exists clients (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null,            -- usuario dueño (closer/agencia)
  name       text not null,
  sector     text,
  created_at timestamptz default now()
);
create index if not exists clients_owner_idx on clients (owner_id);

create table if not exists conversations (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references clients(id) on delete cascade,
  owner_id   uuid not null,
  title      text,
  messages   jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists conversations_client_idx on conversations (client_id);

-- Asociar llamadas (y, cuando se backend-een, leads/ventas/reports) a un cliente.
alter table calls add column if not exists client_id uuid references clients(id);
create index if not exists calls_client_idx on calls (client_id);

alter table clients enable row level security;
alter table conversations enable row level security;
drop policy if exists clients_owner on clients;
create policy clients_owner on clients for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists conversations_owner on conversations;
create policy conversations_owner on conversations for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
