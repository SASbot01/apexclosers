-- 0020 · Memoria del cerebro (Orbe). Memoria persistente por usuario que se gana
-- con el uso: hechos del negocio (semantic), resultados (episodic), preferencias
-- (procedural/social). Recuperación semántica con embeddings locales (768 dims),
-- espejando el patrón de call_chunks (0018). Aislada por user_id (RLS).
create extension if not exists vector;

create table if not exists memories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  type         text not null default 'semantic',   -- episodic|semantic|procedural|social
  content      text not null,                       -- el hecho, en una frase
  structured   jsonb,                               -- campos opcionales (amount, lead, ...)
  embedding    vector(768),
  salience     real default 0.5,                    -- 0..1 importancia
  confidence   real default 0.8,                    -- 0..1 certeza
  source       text,                                -- call | chat | onboarding | inferred
  source_ref   text,                                -- call:<id> | msg:<id>
  created_at   timestamptz default now(),
  last_recalled_at timestamptz,
  recall_count int default 0
);
create index if not exists memories_user_idx on memories (user_id);
create index if not exists memories_embed_idx on memories using hnsw (embedding vector_cosine_ops);

alter table memories enable row level security;
drop policy if exists memories_owner on memories;
create policy memories_owner on memories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Resumen vivo del usuario (1 fila por usuario): perfil/negocio/estilo que el Orbe
-- inyecta casi siempre.
create table if not exists user_models (
  user_id    uuid primary key,
  profile    text,
  business   text,
  style      text,
  updated_at timestamptz default now()
);
alter table user_models enable row level security;
drop policy if exists user_models_owner on user_models;
create policy user_models_owner on user_models for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Recuperación semántica de memorias (espeja match_call_chunks de 0018).
create or replace function match_memories(uid uuid, query_embedding text, match_count int)
returns table(id uuid, type text, content text, structured jsonb, salience real, source_ref text, score double precision)
language sql stable as $$
  select m.id, m.type, m.content, m.structured, m.salience, m.source_ref,
         1 - (m.embedding <=> query_embedding::vector) as score
  from memories m
  where m.user_id = uid and m.embedding is not null
  order by m.embedding <=> query_embedding::vector
  limit match_count
$$;
