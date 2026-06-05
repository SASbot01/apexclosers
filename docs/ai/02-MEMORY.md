# 02 — MEMORY (Memoria)

> Qué recuerda el Orbe de *este* usuario y cómo. Persistente, aislada por `user_id`,
> y diseñada para crecer con cada llamada y cada conversación.

## 1. Principio

La memoria es lo que convierte al Orbe de "modelo que responde" en "alguien que te conoce".
Es **por usuario** y **se gana con el uso**: cuantas más llamadas y conversaciones, mejor te
entiende. Eso es exactamente lo que sube el LTV y baja el churn.

> Inspiración directa: el sistema de memoria en ficheros que ya usamos (un hecho por
> registro + metadata + índice). Aquí lo llevamos a una tabla por usuario con recuperación
> semántica.

## 2. Taxonomía de memoria

| Tipo | Qué guarda | Ejemplo |
|---|---|---|
| **Working** | el turno/sesión actual | "ahora mismo está revisando la llamada con Julián" |
| **Episodic** | hechos que pasaron, con tiempo | "el 28/05 cerró a María, 2.400€, pago único" |
| **Semantic** | hechos estables del usuario y su negocio | "vende un programa high-ticket de fitness a ~1.500€" |
| **Procedural** | cómo le gusta trabajar / playbooks | "hace follow-up por WhatsApp, no por email" |
| **Social** | la relación con el Orbe | "prefiere franqueza", "le puso de nombre 'Wolfy'" |

- **Working** es efímera (vive en la ventana de contexto, no se persiste tal cual).
- Las otras cuatro se **persisten** en el almacén por usuario.

## 3. Esquema (mock-first → Supabase)

```sql
-- Aislado por usuario: TODA query lleva user_id. RLS por user_id en Supabase.
create table memories (
  id           uuid primary key,
  user_id      uuid not null,                 -- AISLAMIENTO (RLS)
  type         text not null,                 -- episodic|semantic|procedural|social
  content      text not null,                 -- el hecho, en una frase
  structured   jsonb,                         -- opcional: campos (lead_id, amount, …)
  embedding    vector(1536),                  -- para recall semántico
  salience     real default 0.5,              -- 0..1 importancia
  confidence   real default 0.8,              -- 0..1 certeza
  source       text,                          -- call:<id> | chat | onboarding | inferred
  source_ref   text,                          -- id de la llamada/mensaje origen
  created_at   timestamptz default now(),
  last_recalled_at timestamptz,
  recall_count int default 0,
  expires_at   timestamptz,                   -- null = no caduca
  superseded_by uuid                          -- si un hecho actualiza a otro
);
```

`user_models` (un registro por usuario) guarda el **resumen vivo** del usuario (perfil,
negocio, estilo) que se inyecta casi siempre — ver [06](./06-PERSONALIZATION-PER-USER.md).

## 4. Política de escritura (qué/cuándo recordar)

**Disparadores de escritura:**
- Tras cada **llamada/transcripción** procesada → extrae hechos episódicos (resultado,
  objeciones, próximos pasos) y candidatos semánticos (datos del negocio del usuario que
  se repiten).
- Tras una **conversación** con el Orbe → preferencias, decisiones, contexto nuevo.
- Cuando el usuario dice explícitamente **"recuerda que…"** → semantic/procedural, alta salience.

**Qué SÍ recordar:** preferencias, hechos estables del negocio, resultados, patrones,
relaciones (leads clave), cómo le gusta trabajar.
**Qué NO recordar:** ruido transaccional ya almacenado en tablas de producto (cada llamada
ya vive en `calls`), datos triviales, PII innecesaria.

**Crear vs actualizar:** antes de escribir, recall del tema; si existe un hecho equivalente
→ se **actualiza** (sube confidence/recencia) o se **supersede** (marca el viejo
`superseded_by`). Evita duplicados y contradicciones. Misma disciplina que el "check before
save" de la memoria en ficheros.

**Salience inicial:** explícito del usuario = 0.9; patrón repetido = 0.7; inferido suelto =
0.4. La salience sube cuando un hecho se recuerda/confirma y baja con el tiempo si no.

## 5. Recuperación (recall)

Híbrida, por relevancia al contexto del turno:
```
score = w1·sim_embedding + w2·recencia + w3·salience + w4·match_estructural
```
- Filtrar **siempre** por `user_id` (aislamiento duro).
- Mezclar tipos según la intención: una pregunta de "¿qué hago hoy?" prioriza procedural +
  episodic reciente; una de "¿quién es este lead?" prioriza structured match por `lead_id`.
- Top-K acotado por el presupuesto de tokens (ver [03](./03-CONTEXT.md)).
- Marcar `last_recalled_at` + `recall_count` (refuerzo).

## 6. Consolidación y olvido

- **Consolidación periódica (cron):** agrupa episódicos repetidos en un semantic
  ("X follow-ups por WhatsApp" → "trabaja seguimientos por WhatsApp"). Promueve patrones.
- **Resumen:** episódicos antiguos se comprimen en resúmenes por periodo para no inflar el
  almacén.
- **Decay:** baja la salience de lo no recordado; lo que cae por debajo de un umbral y no es
  semantic clave se archiva (no se borra de golpe).
- **Caducidad:** hechos con `expires_at` (p.ej. "está de vacaciones hasta el 15") se purgan.

## 7. Conflictos y verdad

- Si dos hechos se contradicen, gana **mayor confidence + recencia**; el otro se marca
  `superseded_by`. El Orbe puede preguntar para desempatar si es importante.
- Nada se afirma como hecho si su `confidence` es baja → el Orbe lo fraseará como suposición.

## 8. Aislamiento y privacidad (resumen — detalle en [07])

- **RLS por `user_id`** en Supabase. Ninguna query sin filtro de usuario.
- La memoria de un usuario **jamás** entra en el contexto de otro. Test de no-filtración en
  evals ([08]).
- El usuario puede **ver, exportar y borrar** su memoria (control + GDPR). "Olvida esto"
  borra el registro.

## 9. Interfaz de código (cuando se construya)

```
src/lib/orbe/memory.js
  remember({ userId, type, content, structured, source, salience })
  recall({ userId, query, types, k, budgetTokens })
  consolidate(userId)        // cron
  forget({ userId, id|filter })
src/data/hooks/useMemory.js  // swap mock → Supabase
```
Mock-first: `src/data/mock/memories.<user>.js` con la misma forma que la tabla.
