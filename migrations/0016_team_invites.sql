-- 0016 · Equipos por INVITACIÓN. La empresa (cuenta cliente) invita a un closer
-- a su equipo; el closer lo acepta o rechaza desde su perfil (como una invitación
-- de amigo). Las membresías existentes quedan aceptadas.
alter table team_members add column if not exists status text default 'accepted';   -- pending | accepted
alter table team_members add column if not exists created_at timestamptz default now();
