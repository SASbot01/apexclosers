-- 0019 · (1) VARIAS cuentas de Google por usuario (multi-calendar para closers que
-- llevan clientes con correos distintos). (2) Sistema HOST: página pública de
-- reserva tipo Calendly editable (disponibilidad + formulario de intake) que crea
-- el evento Google+Meet del host. (3) Etiqueta de PROYECTO en leads para el CRM de
-- empresa (filtrar por closer y por proyecto).

create extension if not exists pgcrypto;

-- ── (1) VARIAS CUENTAS DE GOOGLE ────────────────────────────────────────────
-- Antes: google_tokens tenía user_id como PK (1 cuenta por usuario) y el login
-- hacía upsert (conectar otra te la machacaba). Ahora N filas por usuario: la del
-- login es is_primary=true; el closer puede conectar las cuentas de sus clientes.
create table if not exists google_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  google_sub    text,
  email         text not null,                 -- correo de ESA cuenta Google
  access_token  text,
  refresh_token text,
  expiry        timestamptz,
  label         text,                          -- alias que le pone el closer ("Cliente Hugo")
  is_primary    boolean default false,         -- la cuenta del login
  active        boolean default true,          -- si se incluye en el calendario unificado
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (user_id, email)
);
create index if not exists google_accounts_user_idx on google_accounts (user_id);
alter table google_accounts enable row level security;   -- solo backend (service key)

-- Migrar las cuentas ya conectadas (google_tokens) → google_accounts como primaria.
-- El email de la primaria = el del login (users.email).
insert into google_accounts (user_id, access_token, refresh_token, expiry, email, is_primary)
select gt.user_id, gt.access_token, gt.refresh_token, gt.expiry, u.email, true
from google_tokens gt join users u on u.id = gt.user_id
where u.email is not null
on conflict (user_id, email) do nothing;

-- ── (2) HOST · página pública de reserva (una por usuario) ──────────────────
create table if not exists host_pages (
  user_id        uuid primary key references users(id) on delete cascade,
  slug           text unique,                  -- apex-closers.com/agenda/<slug>
  title          text,
  description     text,
  color          text default '#7c5cff',
  timezone       text default 'Europe/Madrid',
  durations      jsonb default '[30]',         -- opciones de duración (min)
  buffer_min     int default 0,                -- colchón entre reuniones
  availability   jsonb default '{}',           -- { mon:[["09:00","17:00"]], tue:[...], ... }
  min_notice_hours int default 4,              -- antelación mínima para reservar
  max_days_ahead int default 30,               -- ventana futura reservable
  intake_fields  jsonb default '[]',           -- [{key,label,type:'text|tel|textarea|select',required,options}]
  location_type  text default 'google_meet',   -- google_meet | phone | custom
  location_value text,                          -- teléfono / texto si no es Meet
  calendar_account_id uuid,                     -- qué google_account hospeda (null = primaria)
  project        text,                          -- client_key al que se atribuyen las reservas (opcional)
  active         boolean default true,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
alter table host_pages enable row level security;   -- lectura pública vía backend (service key)

-- Reservas hechas desde la página pública del host.
create table if not exists host_bookings (
  id           uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references users(id) on delete cascade,
  name         text,
  email        text,
  phone        text,
  answers      jsonb default '{}',
  start_at     timestamptz not null,
  end_at       timestamptz,
  duration_min int,
  event_id     text,                            -- evento Google creado
  meet_url     text,
  status       text default 'confirmed',        -- confirmed | cancelled
  created_at   timestamptz default now()
);
create index if not exists host_bookings_host_idx on host_bookings (host_user_id, start_at desc);
alter table host_bookings enable row level security;

-- ── (3) PROYECTO en leads (CRM de empresa) ──────────────────────────────────
-- client_key del proyecto (= teams.client_key / sales.client_id). Permite a la
-- empresa filtrar los leads de sus closers por proyecto, y al closer etiquetar.
alter table leads add column if not exists project text;
create index if not exists leads_project_idx on leads (owner_id, project);
