-- 0006 · WhatsApp (QR) — mensajes con leads + estado de sesión por usuario.
create extension if not exists pgcrypto;

create table if not exists lead_messages (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null,
  lead_id    uuid references leads(id) on delete set null,
  phone      text,
  direction  text,            -- in | out
  body       text,
  wa_id      text,
  created_at timestamptz default now()
);
create index if not exists lead_messages_lead_idx on lead_messages (lead_id, created_at);

create table if not exists whatsapp_sessions (
  user_id    uuid primary key references users(id) on delete cascade,
  status     text default 'disconnected',  -- disconnected | qr | connected
  phone      text,
  updated_at timestamptz default now()
);

alter table lead_messages enable row level security;
drop policy if exists lead_messages_owner on lead_messages;
create policy lead_messages_owner on lead_messages for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
alter table whatsapp_sessions enable row level security;
