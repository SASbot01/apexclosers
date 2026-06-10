-- 0014 · Cuentas de CLIENTE (empresas que ofrecen trabajo a closers). NO se
-- registran con Google: las provisionamos nosotros con email + contraseña. Su
-- perfil = perfil de empresa (reusa `profiles`: display_name=empresa, bio=descr,
-- links=redes/web). Publican OFERTAS visibles para closers. La creación de
-- equipos pasa a ser SOLO de clientes (verificación de que el closer trabaja
-- de verdad para ese cliente real).

-- Hash de contraseña para cuentas de cliente (login email+pass). Formato scrypt
-- "salt:hash". Las cuentas de closer (Google) lo dejan a null.
alter table users add column if not exists password_hash text;
-- account_type ya se añadió en 0013 (closer | client). Reafirmamos por idempotencia.
alter table users add column if not exists account_type text default 'closer';

-- ── OFERTAS de trabajo (las publican los clientes; públicas para closers) ─────
create table if not exists offers (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references users(id) on delete cascade,  -- la cuenta de cliente
  title       text not null,
  description text,
  comp        text,                         -- compensación / comisión (texto libre)
  product     text,                         -- qué se vende
  location    text,                         -- remoto / país
  link        text,                         -- link a más info / aplicar fuera
  status      text default 'open',          -- open | closed
  created_at  timestamptz default now()
);
create index if not exists offers_owner_idx on offers (owner_id, created_at desc);
create index if not exists offers_open_idx on offers (status, created_at desc);
alter table offers enable row level security;
drop policy if exists offers_public_read on offers;
create policy offers_public_read on offers for select using (true);
drop policy if exists offers_owner_write on offers;
create policy offers_owner_write on offers for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
