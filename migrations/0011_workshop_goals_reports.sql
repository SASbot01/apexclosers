-- 0011 · Workshop (habilidades del closer derivadas de la IA) + Objetivos
-- mensuales + Reportes manuales + chats del coach. Todo aislado por usuario.

create extension if not exists pgcrypto;

-- Puntuación de habilidades de cada llamada (la calcula la IA leyendo la
-- transcripción). El Workshop agrega estas filas para el hexagrama, el estilo
-- (habla/escucha, wpm, tono) y el cuello de botella.
--   skills = { apertura, descubrimiento, propuesta, objeciones, cierre,
--              seguimiento  (0..1),
--              talk_ratio (0..1 fracción que habla el closer),
--              wpm, questions,
--              tono:{seguridad,empatia,dudas} (suman 100) }
alter table calls add column if not exists skills jsonb;

-- ── OBJETIVOS mensuales (Home / Ajustes) ────────────────────────────────────
-- Un set de objetivos por usuario (editable). base = objetivo mensual; Home lo
-- escala al periodo del filtro. Si no hay fila, el front usa los valores semilla.
create table if not exists goals (
  user_id    uuid primary key,
  calls      numeric default 12,
  closes     numeric default 4,
  cash        numeric default 6000,
  extra      jsonb default '{}'::jsonb,   -- objetivos adicionales libres
  updated_at timestamptz default now()
);
alter table goals enable row level security;
drop policy if exists goals_owner on goals;
create policy goals_owner on goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── REPORTES manuales (embudo diario que el closer registra a mano / CSV) ────
-- Embudo: Agendadas → Realizadas → Ofertas → Depósitos → Cierres. Un registro
-- por día (+cliente); al registrar otra vez el mismo día se SUMA (upsert).
create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,
  client_id   text,
  date        date not null,
  scheduled   int default 0,
  realizadas  int default 0,
  offers      int default 0,
  deposits    int default 0,
  closes      int default 0,
  created_at  timestamptz default now()
);
create unique index if not exists reports_owner_day_client
  on reports (owner_id, date, coalesce(client_id, ''));
create index if not exists reports_owner_idx on reports (owner_id, date desc);
alter table reports enable row level security;
drop policy if exists reports_owner on reports;
create policy reports_owner on reports for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ── CLAVE DE CLIENTE (string) para conversaciones / scripts / resultados ─────
-- La UI identifica al cliente/proyecto por una clave de texto (no por el uuid de
-- la tabla clients, que aún no se modela en el front). Añadimos client_key para
-- poder persistir conversaciones y guiones por esa clave sin tocar la FK uuid.
alter table conversations add column if not exists client_key text;
alter table scripts        add column if not exists client_key text;
alter table call_results   add column if not exists client_key text;
create index if not exists conversations_ckey_idx on conversations (owner_id, client_key);
create unique index if not exists scripts_owner_ckey on scripts (owner_id, client_key);
create index if not exists call_results_ckey_idx on call_results (owner_id, client_key, created_at desc);

-- ── CHATS DEL COACH (Workshop) ──────────────────────────────────────────────
-- Conversaciones guardadas del chat-coach del Workshop (distintas de las
-- conversaciones por cliente de la tabla `conversations`).
create table if not exists coach_chats (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  title      text,
  messages   jsonb default '[]'::jsonb,    -- [{role,body,ts}]
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists coach_chats_user_idx on coach_chats (user_id, updated_at desc);
alter table coach_chats enable row level security;
drop policy if exists coach_chats_owner on coach_chats;
create policy coach_chats_owner on coach_chats for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
