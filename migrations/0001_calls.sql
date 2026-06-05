-- 0001 · tabla `calls` (Recall.ai) — aislada por usuario.
-- Forma espejo del shape que consume el front (src/data/mock/calls.js).

create extension if not exists pgcrypto;

create table if not exists calls (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,                 -- AISLAMIENTO (RLS)
  bot_id             text unique,                   -- id del bot Recall
  meeting_url        text,
  platform           text,                          -- google_meet | zoom | teams
  meeting_id         text,
  calendar_event_id  text,
  title              text,
  classification     jsonb,                         -- salida del callClassifier
  participants       jsonb default '[]'::jsonb,
  status             text default 'scheduled',      -- scheduled|joining|in_call_recording|in_call_not_recording|done|fatal|cancelled
  scheduled_at       timestamptz,
  started_at         timestamptz,
  ended_at           timestamptz,
  transcript         jsonb default '[]'::jsonb,     -- [{speaker,text,startMs,endMs}]
  raw_webhook_events jsonb default '[]'::jsonb,
  recording_url      text,
  summary            text,                          -- markdown (Claude)
  feedback           text,                          -- markdown (Claude) — para el dueño/closer
  outcome            text,                          -- won|lost|follow_up|no_show|unknown
  offer_made         boolean default false,
  offer_amount       numeric,
  deposit_collected  boolean default false,
  deal_closed        boolean default false,
  deal_amount        numeric,
  next_step          text,
  share_token        text,
  created_at         timestamptz default now()
);

create index if not exists calls_user_idx on calls (user_id, started_at desc);
create index if not exists calls_bot_idx  on calls (bot_id);

-- RLS: cada usuario solo ve lo suyo (con JWT de usuario). La service key del
-- backend bypassa RLS, por eso los endpoints filtran por user_id a mano.
alter table calls enable row level security;
drop policy if exists calls_owner on calls;
create policy calls_owner on calls for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
