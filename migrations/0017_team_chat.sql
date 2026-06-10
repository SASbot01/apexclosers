-- 0017 · Chat de equipo. La empresa y los closers ACEPTADOS de un equipo hablan
-- en un chat grupal. Mensajes persistidos.
create extension if not exists pgcrypto;

create table if not exists team_messages (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  user_id    uuid not null,            -- quién lo escribe (empresa o closer)
  body       text not null,
  created_at timestamptz default now()
);
create index if not exists team_messages_idx on team_messages (team_id, created_at);
alter table team_messages enable row level security;
drop policy if exists team_messages_rw on team_messages;
create policy team_messages_rw on team_messages for all using (true) with check (true);
