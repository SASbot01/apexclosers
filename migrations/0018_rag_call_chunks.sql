-- 0018 · RAG del coach. Indexamos fragmentos de las transcripciones (resumen,
-- feedback y ventanas del transcript) con embeddings locales (nomic-embed-text,
-- 768 dims) para que el coach RECUPERE y CITE llamadas concretas.
create extension if not exists vector;

create table if not exists call_chunks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  call_id    uuid,
  kind       text,                       -- summary | feedback | transcript | fact
  text       text not null,
  ref        text,                       -- etiqueta de cita (título · fecha)
  call_title text,
  call_date  timestamptz,
  embedding  vector(768),
  created_at timestamptz default now()
);
create index if not exists call_chunks_user_idx on call_chunks (user_id);
create index if not exists call_chunks_call_idx on call_chunks (call_id);
-- Índice ANN coseno (hnsw) para búsqueda rápida por similitud.
create index if not exists call_chunks_embed_idx on call_chunks using hnsw (embedding vector_cosine_ops);

alter table call_chunks enable row level security;
drop policy if exists call_chunks_owner on call_chunks;
create policy call_chunks_owner on call_chunks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Búsqueda de los fragmentos más relevantes de un usuario para una consulta.
-- query_embedding entra como texto ('[...]') y se castea a vector (robusto con PostgREST).
create or replace function match_call_chunks(uid uuid, query_embedding text, match_count int)
returns table(id uuid, call_id uuid, kind text, chunk_text text, ref text, call_title text, call_date timestamptz, score double precision)
language sql stable as $$
  select c.id, c.call_id, c.kind, c.text, c.ref, c.call_title, c.call_date,
         1 - (c.embedding <=> query_embedding::vector) as score
  from call_chunks c
  where c.user_id = uid and c.embedding is not null
  order by c.embedding <=> query_embedding::vector
  limit match_count
$$;
