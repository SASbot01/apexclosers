-- 0002 · usuarios + sesiones (login con Google). Cualquier persona puede entrar.

create extension if not exists pgcrypto;

create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  google_sub  text unique,
  email       text unique not null,
  name        text,
  picture     text,
  created_at  timestamptz default now()
);

create table if not exists sessions (
  token       text primary key,
  user_id     uuid not null references users(id) on delete cascade,
  created_at  timestamptz default now(),
  expires_at  timestamptz
);
create index if not exists sessions_user_idx on sessions (user_id);
