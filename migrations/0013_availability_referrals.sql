-- 0013 · Disponibilidad del closer + programa de afiliados (tracking real).

create extension if not exists pgcrypto;

-- Estado de disponibilidad del closer (luz en perfil/ranking/buscador/CV):
--   available (verde) · busy (amarillo) · inactive (gris)
alter table profiles add column if not exists status text default 'available';

-- ── AFILIADOS ───────────────────────────────────────────────────────────────
-- Un referido = un usuario que se registró con el ?ref= de otro. La comisión
-- (20% normal, 25% cuentas de comunidad) se aplicará cuando haya facturación
-- (Stripe, más adelante); aquí trackeamos QUIÉN trajo a QUIÉN.
create table if not exists referrals (
  id          uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references users(id) on delete cascade,
  referred_id uuid not null references users(id) on delete cascade,
  status      text default 'active',          -- active | inactive
  plan        text,
  commission  int default 20,                 -- 20 normal · 25 comunidad
  created_at  timestamptz default now(),
  unique (referred_id)                          -- a cada usuario lo refiere como mucho uno
);
create index if not exists referrals_referrer_idx on referrals (referrer_id);

-- Tipo de cuenta (para la épica de cuentas de cliente). Por ahora todos 'closer'.
alter table users add column if not exists account_type text default 'closer';   -- closer | client
