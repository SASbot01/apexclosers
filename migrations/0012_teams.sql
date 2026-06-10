-- 0012 · Equipos de cliente. Un equipo agrupa a los closers que trabajan UNA
-- misma cuenta (cliente); a sus miembros se les comparten las métricas del dueño
-- FILTRADAS a ese cliente (revenue/cierres/cash de "Enforma con Hugo", etc.).
-- client_key es la clave de texto del cliente (la misma que sales.client_id).

create extension if not exists pgcrypto;

create table if not exists teams (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references users(id) on delete cascade,
  name       text not null,
  emoji      text,
  client_key text not null,                      -- cliente/cuenta (= sales.client_id)
  created_at timestamptz default now()
);
create index if not exists teams_owner_idx on teams (owner_id);

create table if not exists team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (team_id, user_id)
);
create index if not exists team_members_user_idx on team_members (user_id);

alter table teams enable row level security;
alter table team_members enable row level security;
drop policy if exists teams_owner on teams;
create policy teams_owner on teams for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists team_members_visible on team_members;
create policy team_members_visible on team_members for all using (true) with check (true);
