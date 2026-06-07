-- 0008 · Ventas (con verificación por justificante) + Perfil social (invitaciones,
-- grupos de amigos, visibilidad pública/privada de métricas).

create extension if not exists pgcrypto;

-- ── VENTAS ────────────────────────────────────────────────────────────────
-- Una venta puede entrar a mano, por CSV o AUTOMÁTICA desde la transcripción
-- (source='transcription'). Solo cuenta en métricas cuando status='verified',
-- y para verificarla hay que subir un justificante (proof_url).
create table if not exists sales (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null,
  client_id       text,                          -- proyecto/cliente (libre)
  call_id         uuid,                          -- llamada de la que salió (si aplica)
  date            timestamptz default now(),
  closer          text,
  product         text,
  revenue         numeric default 0,
  cash_collected  numeric default 0,
  payment_method  text,
  payment_type    text default 'Pago único',
  source          text default 'manual',         -- manual | csv | transcription
  status          text default 'pending',        -- pending | verified | rejected
  proof_url       text,                           -- justificante (storage / data-url)
  proof_name      text,
  notes           text,
  created_at      timestamptz default now()
);
create index if not exists sales_owner_idx on sales (owner_id, date desc);
create unique index if not exists sales_call_uniq on sales (call_id) where call_id is not null;
alter table sales enable row level security;
drop policy if exists sales_owner on sales;
create policy sales_owner on sales for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ── PERFIL ────────────────────────────────────────────────────────────────
create table if not exists profiles (
  user_id      uuid primary key references users(id) on delete cascade,
  nickname     text unique,                       -- te buscan por aquí
  display_name text,
  headline     text,                              -- titular corto
  bio          text,                              -- descripción
  photo_url    text,
  links        jsonb default '[]',                -- [{label,url}]
  location     text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists profiles_nick_idx on profiles (lower(nickname));
alter table profiles enable row level security;

-- Visibilidad de métricas: qué claves son públicas en tu perfil.
-- visible[clave]=true → pública. Lo demás, privado.
create table if not exists metric_visibility (
  user_id   uuid primary key references users(id) on delete cascade,
  visible   jsonb default '{}'                    -- { "cash_closed": true, "close_rate": true, ... }
);
alter table metric_visibility enable row level security;

-- ── AMIGOS / INVITACIONES ──────────────────────────────────────────────────
-- Una fila por relación dirigida solicitante→destinatario. status accepted = amigos.
create table if not exists friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references users(id) on delete cascade,
  addressee_id uuid not null references users(id) on delete cascade,
  status       text default 'pending',            -- pending | accepted | blocked
  created_at   timestamptz default now(),
  unique (requester_id, addressee_id)
);
create index if not exists friendships_addr_idx on friendships (addressee_id, status);
create index if not exists friendships_req_idx on friendships (requester_id, status);
alter table friendships enable row level security;

-- Grupos de amigos (estilo "club") para compartir highlights + métricas.
create table if not exists friend_groups (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references users(id) on delete cascade,
  name       text not null,
  emoji      text,
  created_at timestamptz default now()
);
create table if not exists friend_group_members (
  group_id  uuid not null references friend_groups(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  primary key (group_id, user_id)
);
alter table friend_groups enable row level security;
alter table friend_group_members enable row level security;

-- Cuenta demo de dogfooding (el VITE_USER_ID fijo). En producción los usuarios
-- se crean al hacer login con Google; esto solo asegura que la cuenta local
-- exista para perfil/visibilidad/amigos. Idempotente.
insert into users (id, email, name)
values ('00000000-0000-0000-0000-000000000001', 'alejandro@apex.local', 'Alejandro')
on conflict (id) do nothing;
