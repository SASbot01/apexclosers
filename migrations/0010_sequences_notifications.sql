-- 0010 · Workflow de seguimiento (secuencias) + notificaciones + estado fino de
-- la llamada + ranking (este último se calcula, no necesita tabla).

-- Estado fino de la llamada (captura "Flujo Llamada Realizada"):
-- ganada | deposito | no_show | perdido | follow_up_hot | follow_up_nurture | unknown
alter table calls add column if not exists state text;

-- ── SECUENCIAS (Configuración de Secuencias / Workflow) ─────────────────────
-- Cada secuencia se dispara por un estado de llamada y tiene pasos: cada paso es
-- {delay_hours, channel(email|whatsapp|sms), type(confirmacion|seguimiento), message}.
create table if not exists sequences (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null,
  name         text not null,
  trigger_state text not null,                  -- estado que la dispara
  active       boolean default true,
  steps        jsonb default '[]',
  created_at   timestamptz default now()
);
create index if not exists sequences_owner_idx on sequences (owner_id, trigger_state);
alter table sequences enable row level security;

-- Tareas de seguimiento generadas al clasificar una llamada (se ejecutan por cron).
create table if not exists follow_up_tasks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null,
  call_id      uuid,
  lead_id      uuid,
  sequence_id  uuid,
  step_index   int default 0,
  channel      text,                            -- email | whatsapp | sms
  type         text,                            -- confirmacion | seguimiento
  message      text,
  contact      text,                            -- email/teléfono del lead si se conoce
  run_at       timestamptz,
  status       text default 'pending',          -- pending | sent | skipped | failed
  created_at   timestamptz default now()
);
create index if not exists fut_owner_idx on follow_up_tasks (owner_id, status, run_at);
alter table follow_up_tasks enable row level security;

-- ── NOTIFICACIONES ─────────────────────────────────────────────────────────
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  kind       text,                              -- sale_confirm | sale_verified | follow_up | system
  title      text,
  body       text,
  link       text,                              -- ruta del front a la que lleva
  read       boolean default false,
  created_at timestamptz default now()
);
create index if not exists notif_user_idx on notifications (user_id, read, created_at desc);
alter table notifications enable row level security;
