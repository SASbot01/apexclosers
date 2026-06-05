# DEVELOPMENT — diario de desarrollo

> **Para qué sirve este documento.** Es el cuaderno de bitácora del proyecto: dónde
> estamos, qué decidimos, qué hablamos y qué toca después. Si dejamos algo a medias,
> aquí se retoma sin perder contexto — para Alex y para Claude.
>
> **Cómo usarlo:** al empezar una sesión, lee primero **§DÓNDE ESTAMOS** y **§ENFOQUE
> ACTUAL**. Al terminar un bloque de trabajo, añade una entrada en **§BITÁCORA** y
> actualiza **§PRÓXIMOS PASOS**.
>
> Documentos hermanos: [`PDR.md`](./PDR.md) (alcance/biblia) · [`docs/FLOW.md`](./docs/FLOW.md) (flujo de uso) · [`docs/ai/`](./docs/ai/README.md) (arquitectura de IA).

---

## 🧭 DÓNDE ESTAMOS  ·  (actualizado 2026-06-02)

- **Fase del roadmap:** **FASE 0 — Cimientos / Dogfood.**
- **Estado del software:** shell + **integración Recall.ai portada** (`api/recall.js` + libs).
  Llamadas · Transcripciones · Detalle cableadas (con **resumen + feedback IA** vía Claude).
  La UI funciona ya con **fallback a mock** en dev; datos reales al desplegar.
- **Lo último hecho:** **Leads (CRM)** completo (kanban/lista/filtros/Smart Views/ficha clicable
  con datos editables, actividad y **chat WhatsApp**, iniciar guion desde el lead, link Zoom/Meet,
  botón Calendario) + **backend Google Calendar** (auto-crear leads, **calendarios compartidos**) +
  **worker WhatsApp por QR** (Baileys) + puente. Ver bitácora 2026-06-02.
- **OJO demo vs vivo:** el CRM funciona en demo (mock). **Calendar y WhatsApp solo funcionan
  desplegados** (claves Google + worker WhatsApp siempre encendido). 
- **Siguiente acordado con Alex: DEPLOY.**
- **Bloqueante nº1 a resolver:** **desplegar en Vercel + claves** (RECALL_API_KEY, Supabase,
  Anthropic) + correr `migrations/0001_calls.sql` + registrar el webhook de Recall →
  pasar de mock a datos EN VIVO y empezar el dogfooding real.

## 🎯 ENFOQUE ACTUAL — qué importa AHORA (y qué no)

**SÍ importa ahora (Fase 0):**
1. Que el shell arranque y se vea bien (✅ hecho).
2. Conectar **Recall.ai** + Llamadas/Transcripciones/Detalle (✅ código hecho).
3. **Desplegar + claves + migración + webhook** → datos en vivo.
4. Que Alex use la app con sus llamadas reales (dogfooding, usuario cero).

**NO importa ahora (frenar si nos desviamos):**
- ❌ Construir el Orbe completo con IA (eso es Fase 1 — primero datos).
- ❌ Stripe / tokens / afiliados (Fase 2).
- ❌ Finance, Reports, Marketing, Team (fuera de alcance del producto closer).
- ❌ Pulir features secundarias antes de tener el bucle llamada→transcripción→feedback.

> **Regla de guía (Claude):** si una petición se sale de la Fase 0, lo señalo y propongo
> aparcarla en §BACKLOG con su fase, para no romper la secuencia
> **PROBAR → COBRAR → PROMOCIONAR → ESCALAR**.

---

## 🗺️ ROADMAP (recordatorio)

| Fase | Foco | Puerta de salida |
|---|---|---|
| **0 — Cimientos / Dogfood** ⬅️ aquí | que funcione para Alex | un día de venta entero pasa por la app sin romperse |
| 1 — Oferta + 10 socios | prueba, no ingresos | ≥10 closers a diario + 3 testimonios + retención sem.4 |
| 2 — Monetización | unit economics | ~50 seats de pago · COGS/LTV/CAC reales |
| 3 — Saturación | flywheel afiliados/academias | ~600 seats · churn < 8% |
| 4 — Escala / Plataforma | techo + upsell All-in-One | ~2.000 seats · ARR ~1,9M€ |

Detalle de negocio (pricing, afiliados, unit economics) en [`PDR.md §12–13`](./PDR.md).

---

## ▶️ CÓMO ARRANCAR EL PROYECTO

```bash
cd /Users/alex/apex-closer
npm install      # primera vez
npm run dev      # http://localhost:5173
# Nota: el monorepo Apex-operations suele ocupar el 5173. Si está pillado:
#   npm run dev -- --port 5180 --strictPort   →  http://localhost:5180
npm run build    # build de producción
```
> El `api/` (Recall) NO corre en `vite dev` → en dev ves datos demo (mock).
> Para el API real: `vercel dev` o desplegar en Vercel.
Stack: Vite 7 · React 19 · react-router-dom 7 · framer-motion · lucide-react · recharts.
Tema y componentes replicados de Apex Operations (`/Users/alex/Apex-operations`).

---

## 📓 BITÁCORA (entradas con fecha)

### 2026-06-01 — Estrategia, PDR y arquitectura de IA
- Análisis de la llamada de reenfoque (Alex · Laurent · Jordi). Decisión: producto
  vertical para **closers hispanos**, modelo **token x3** + **afiliados**, marca solo-logo.
- Estudio de mercado + unit economics + proyección + sistema de afiliados (en chat).
- Creado repo **`/Users/alex/apex-closer`** con **PDR** + árbol de carpetas.
- Suite de **arquitectura de IA** en `docs/ai/` (Soul · Memory · Context · Intention ·
  Tools · Personalization per-user · Safety · Evals), diseñada **por usuario** desde día 0.

### 2026-06-02 — Métricas del closer + registro de ventas desde el guion
- **Fórmulas (sobre llamadas realizadas):** Show=realizadas/agendadas · Oferta=ofertas/realizadas
  · Depósito=depósitos/realizadas · **Close=cierres/realizadas** · **Commitment=(cierres+depósitos)/realizadas**.
- **% Recollected** (cash/revenue) en **Home** y en **Métricas (Ventas)**.
- **Store** `lib/metrics.js` (localStorage): `addReportEntry` (suma al MISMO día), `addSale`,
  `importReportsCsv`, `importSalesCsv`. Reports y Finanzas hacen merge baseline mock + registrado.
- **Guion (LiveScript):** al registrar, si outcome = **Cierre o Depósito** aparecen campos
  Importe + Cash; **siempre suma al reporte diario automáticamente** y, si hay venta, la añade a Finanzas.
- **Métricas:** **Importar CSV** (reportes o ventas) + **Reportar** (manual) en ambas vistas; si el
  día ya existe, se suma a ese día.
- `vite build` OK.

### 2026-06-02 — Calendario embebido (hora España) + fix editor Scripts
- **Calendario en la UI**: `pages/calendar/Calendar.jsx` = Google Calendar **embebido** (iframe,
  `ctz=Europe/Madrid`), bidireccional (editas tu calendario real ahí). Sub-vista de **Llamadas**
  (Llamadas · Guion · Calendario), ruta `/calendario`; el botón "Calendario" de Leads navega ahí.
  Scope OAuth subido a `calendar` (read+write) + `api/calendar.js` acción `create` (evento con Meet,
  hora España) → bidireccional también a nivel API.
- **Fix editor Scripts**: textareas salían estrechas/cortas → `width:100%` + `box-sizing` +
  `min-height` + resize vertical.

### 2026-06-02 — Leads (CRM) + Google Calendar + WhatsApp (QR) · "todo seguido"
Decisión: copiar el CRM de Apex **verbatim no es viable** (28 comp · 357 i18n · i18n.js 228KB ·
SalesStore · useApexCrm · permisos · crmMockData 69KB). Se **recrea fiel** en stack limpio.
- **Leads (CRM)** (`pages/leads/Leads.jsx`) — renombrada desde Pipeline (path /pipeline + alias
  /leads): **Kanban + Lista**, filtros (búsqueda · cliente · etapa · fuente · etiqueta · asignado),
  **Smart Views** (presets + guardar vista en localStorage), **ficha clicable** (drawer) con datos
  editables · actividad · **chat de WhatsApp**, **▶ Iniciar guion** (→ /scripts/live/:clientId),
  **link Zoom/Meet**, mover de etapa, **botón Calendario (Google)**. Modelo `mock/leads.js`
  enriquecido (email/phone/source/tags/assignee/meeting_url). `components/SegTabs` reutilizado.
- **Google Calendar (backend)** — `api/calendar.js` (`events`, `sync`): lee **todos los calendarios
  visibles, incluidos los COMPARTIDOS** (calendarList), clasifica (callClassifier) y **crea leads
  solos** (dedupe por `calendar_event_id`). `api/auth.js`: scope `calendar.readonly` + `prompt=consent`
  + guarda tokens en `google_tokens`. Migración **0005** (leads + google_tokens).
- **WhatsApp por QR (tu número)** — servicio aparte `whatsapp-worker/` (Baileys: QR, sesión por
  usuario, send/recv) + puente `api/whatsapp.js` (connect/qr/status/send/webhook). En la ficha del
  lead: chat + "Conectar (QR)" + "Abrir en WhatsApp" (wa.me funciona ya). Migración **0006**
  (lead_messages + whatsapp_sessions). ⚠️ Worker = siempre encendido (Railway/Render/VPS), no Vercel,
  contra ToS (riesgo baneo).
- **Resumen del lead (IA)** — tab **Resumen** en la ficha del lead con 7 campos (Objetivos ·
  Bloqueos · Compromiso · Cualificación · Financiera · Prioridad · Decisión), una frase c/u.
  Demo: semillas en l1/l3 + botón "Generar resumen" (`genLeadSummary`). En vivo lo produce
  `finalize` (Recall→Claude, campo `lead_summary`) y se copia a `leads.summary` al enlazar la
  llamada. Migración **0007**.
- `vite build` OK · `node --check` OK en api + worker. **Calendar y WhatsApp = solo en deploy.**

### 2026-06-01 — Simplificación de navegación + métricas embudo + flujo
- **Navegación a 5 destinos** (closers poco técnicos): **Hoy · Clientes · Llamadas · Pipeline ·
  Métricas** + **engranaje** (Ajustes, icono en topbar, fuera de la barra). Home→"Hoy".
- **Sub-vistas con control segmentado** (`components/SegTabs.jsx`), sin más tabs arriba:
  - **Llamadas**: `Llamadas` (historial) · `Guion` (Scripts). 
  - **Métricas**: `Ventas` (Finanzas) · `Embudo` (Reports). Ambas con título "Métricas".
  - `sectionKeyForPath` mapea /scripts→llamadas, /finanzas+/reports→metricas, /ajustes→sin tab.
- **Reports = embudo Apex**: Agendadas → Realizadas → Ofertas → **Depósitos** → Cierres, con
  **% entre etapas** (en el funnel, sin tocar el aspecto limpio) + tasas (show/oferta/depósito/
  cierre) + tabla. `mock/reports.js` regenerado con esos campos.
- **Resultado de llamada** ahora incluye **Depósito** y **No cualifica** (RESULTS en scriptTemplate).
- `fx-grid` pasa a `auto-fit` para soportar 5 KPIs sin romper Finanzas (4).
- **Flujo definido** en `docs/FLOW.md` (bucle del closer, qué es manual vs automático, anti-fricción).
- `vite build` OK. Propuesta abierta: bajar a 4 tabs anidando Pipeline/Guion dentro de Clientes
  (pendiente de OK de Alex).

### 2026-06-01 — Scripts (guion de llamada) · inspirado en /script de Detrás de Cámara
Referencia: `/Users/alex/DetrasdeCamaras/script.html` (teleprompter: fases + tips + objeciones
+ tonalidades + registro Cerrada/Perdida/No-show + historial). Adaptado al método **Apex**:
- `mock/scriptTemplate.js`: guion por defecto (8 fases admisión high-ticket: apertura → situación
  → dolor → objetivo → puente/mecanismo → oferta → precio → cierre) + objeciones (5 patrones) +
  tonalidades (5). `lib/scripts.js`: `useScript`/`saveScript`/`saveCallResult`/`listCallResults`
  (localStorage demo → tablas `scripts`/`call_results`).
- **Sección Scripts** (`pages/scripts/Scripts.jsx`): guion **por cliente**, ver/editar fases
  (añadir/eliminar, líneas + consejos), objeciones/tonalidades, historial de resultados.
- **Modo llamada en vivo** (`pages/scripts/LiveScript.jsx`, `/scripts/live/:clientId`):
  teleprompter con rail de fases, líneas grandes + consejos, objeciones/tonalidades a mano,
  timer, y al terminar **registrar resultado** (outcome + notas + lead opcional) → guardado y
  asociado al cliente.
- Migración **0004_scripts_results.sql** (scripts, call_results, RLS; `call_results.call_id`
  preparado para enlazar con la transcripción cuando se automatice).
- **Decisión del usuario:** la automatización transcripción↔pipeline se deja para más tarde
  (requiere prueba). Esto ya es usable hoy: el closer se apoya en el guion en cada llamada y
  registra el resultado a mano. Nav = 8 secciones. `vite build` OK.

### 2026-06-01 — Clientes (proyectos) como eje
- **Cliente = proyecto**. `mock/clients.js` (3: En Forma con Hugo · YC Logistics · FBA Academy).
  Llamadas/leads/ventas/reports llevan **client_id** (asignado determinista).
- **Filtro por cliente** añadido en Home · Llamadas · Pipeline · Finanzas · Reports.
- **Sección Clientes** (`pages/clients`): lista con stats + detalle (`/clientes/:id`) con KPIs,
  **conversación persistida por cliente** (`lib/conversations.js`, localStorage demo →
  tabla `conversations`), **resumen** y **feedback** generables (data-driven; IA en vivo) +
  llamadas y leads del cliente.
- **Orbe**: "Guardar en cliente" (añade el hilo del Orbe a un cliente) + prompts /clientes.
- Migración **0003_clients_conversations.sql** (clients, conversations, `calls.client_id`, RLS).
- Nav a 7 secciones. `vite build` OK (779 kB; warning de tamaño por recharts, no error).

### 2026-06-01 — Producto completo (acceso + datos + pipeline) · "todo seguido"
Ampliación pedida por Alex (más allá del mínimo Fase 0). 5 oleadas:
- **Acceso**: landing pública (`pages/landing`) + **login con Google** (`api/auth.js`:
  google-start/callback/me/logout · `migrations/0002_users_sessions.sql` users+sessions) +
  `AuthGate` + `lib/auth.js` (sesión real con token; **fallback "modo demo"** para local sin
  claves). Cuenta + logout en Ajustes.
- **Filtros** reutilizables (`components/Filters.jsx` + `lib/filters.js`: rangos + calendarBounds
  con elapsedFrac para proyecciones). Usados en Home, Pipeline, Finanzas, Reports.
- **Home**: filtro de periodo + **objetivos** (barra de % completado, lo que falta y
  **proyección** a fin de periodo) + seguimientos + últimas llamadas. `mock/goals.js`.
- **Finanzas** (`pages/finance`): KPIs + **gráfico dinámico** (recharts area, métrica
  revenue/cash/cierres) + tabla de ventas + filtros (periodo + closer). `mock/sales.js` (36).
- **Reports** (`pages/reports`): KPIs + embudo + tasas (show/offer/close) + tabla + filtro.
  `mock/reports.js` (45 días).
- **Pipeline** tipo Apex: filtros (búsqueda + canal), **drawer de lead con vídeo**, **mover**
  de etapa. **Export de transcripción** (.txt) en el detalle de llamada.
- Nav a 6 secciones; prompts del Orbe por sección. `vite build` OK (2.776 módulos).

### 2026-06-01 — Limpieza de IA + vídeo
- **Navegación reducida a 4 secciones**: Home · Llamadas · Pipeline · Ajustes.
  - **Transcripciones** eliminada como sección → vive DENTRO del detalle de la llamada.
  - **Seguimientos** eliminada como sección → vive DENTRO del Pipeline (campo "próximo paso"
    en cada lead). Rutas viejas `/transcripciones` y `/seguimientos` → redirect.
- **Vídeo** en el detalle de llamada (`recording_url` de Recall, `<video controls>`). Imperativo
  para el deploy. Mock con vídeos de muestra para ver el player.
- **Home** ahora es un panel real: KPIs (llamadas · cerradas · seguimientos · cash) +
  seguimientos pendientes + últimas llamadas (derivado de los datos).
- **Ajustes** con contenido real: perfil · conexión de calendario · medidor de uso (tokens) · tema.
- Borradas `Transcripts.jsx` y `FollowUps.jsx`. `vite build` OK (2.114 módulos).

### 2026-06-01 — Recall.ai conectado (Fase 0)
- Portada la integración de **Recall.ai** del monorepo, **limpia y por-usuario** (`user_id`,
  sin client_id, sin sync a CRM/sales):
  - `api/_lib/recall.js` (createBot con `automatic_leave`, transcript, status) + `callClassifier.js`
    (política solo-ventas) — portados casi verbatim.
  - `api/_lib/supabase.js` admin (service key) mínimo.
  - **`api/recall.js`** router action-routed: `start` (ad-hoc) · `webhook` · `finalize`
    (transcript final + **resumen + feedback** Claude `claude-sonnet-4-6` + outcome) ·
    `list` · `get` · `reconcile` · `reconcile-stuck` (cron anti-bots-colgados).
  - `migrations/0001_calls.sql`: tabla **`calls`** aislada por `user_id` (RLS).
  - `vercel.json` (cron reconcile-stuck cada 5 min, función 60s) · `.env.example`.
- **Frontend** cableado con **fallback a mock** (funciona en dev sin backend):
  `lib/config.js` (USER_ID Fase 0) · `lib/api.js` · `data/mock/calls.js` ·
  `data/hooks/{useCalls,useCall}.js` · `components/StatusBadge.jsx` · `styles/pages.css`.
  - **Llamadas**: lista + barra "Grabar llamada" (pega enlace → `start`) + badge de fuente.
  - **Detalle**: resumen + feedback (render markdown-lite) + transcripción por speaker.
  - **Transcripciones**: llamadas con transcripción.
- Verificado: `vite build` OK (2.115 módulos) · `node --check` OK en las 4 funciones api.

### 2026-06-01 — Scaffold Fase 0
- Montado el scaffold reutilizando Apex Operations (no desde cero):
  - **Tema** `ApexTheme.css` (copia de `ApexOpsTheme.css`, 4 temas).
  - **Shell limpio** (sin i18n, sin multi-tenant, sin widgets de admin):
    `ApexLayout` (topbar + logo Apex + selector de tema + nav + scroll + footer),
    `AtmosphericCanvas`, `ThemeContext` (key `apex_closer_theme`).
  - **Orbe** (`ApexOrb`) portado en **modo esqueleto** (UI + historial local; IA en Fase 1).
  - **Componentes**: `FloatingHeader`, `HoverMenu`.
  - **Páginas stub** ruteadas: Home · Llamadas · Detalle de llamada · Transcripciones ·
    Seguimientos · Pipeline · Ajustes.
  - **Config**: `package.json`, `vite.config.js`, `index.html` (favicon = logo Apex,
    fuente Inter Tight), `main.jsx`, `App.jsx`, `.gitignore`.
  - Logos en `public/` (`apex-mark-platinum.svg`, `apex-mark.svg`, `apex-mark-dark.svg`).

---

## ✅ PRÓXIMOS PASOS (retomar por aquí)

**Para pasar de MOCK a EN VIVO (poner Recall.ai a funcionar de verdad):**
1. **Supabase**: crear proyecto → correr `migrations/0001_calls.sql` **y** `0002_users_sessions.sql`
   → copiar `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`.
1.b **Login Google**: crear OAuth client en Google Cloud → `GOOGLE_CLIENT_ID` +
   `GOOGLE_CLIENT_SECRET`; redirect URI autorizado = `https://<deploy>/api/auth?action=google-callback`.
2. **Recall.ai**: cuenta + `RECALL_API_KEY` (región EU). En el dashboard de Recall, registrar
   el **webhook** apuntando a `https://<deploy>/api/recall?action=webhook` (eventos
   bot.status_change · transcript.data · bot.done).
3. **Anthropic**: `ANTHROPIC_API_KEY` (resumen + feedback).
4. **Desplegar en Vercel** (el `api/` solo corre en Vercel, no en `vite dev`). Setear las env
   vars + `APEX_PUBLIC_BASE_URL` = URL del deploy. (Para probar el API en local: `vercel dev`.)
5. **Dogfooding**: Alex pega el enlace de una llamada real en *Llamadas → Grabar llamada* →
   el bot entra, graba, transcribe → al acabar, resumen + feedback automáticos. Usuario cero.

**Después (cierre de Fase 0 → Fase 1):**
6. Login/auth real → sustituir `USER_ID` fijo por el del usuario logueado (aislamiento real).
7. Agenda: endpoint `upcoming-calls` (Google Calendar) + auto-attach con el clasificador.
8. Empezar **Fase 1**: `src/lib/orbe/*` según `docs/ai/` (el Orbe deja el "modo esqueleto").

## 🧊 BACKLOG (aparcado — fase futura)
- Stripe / sistema de tokens (Fase 2).
- Sistema de afiliados + dashboard (Fase 2–3).
- Empaquetado Tauri (escritorio) — opcional.
- Onboarding (siembra del user model) — inicio de Fase 1.

## 🧱 DECISIONES (log)
- **2026-06-01** Repo nuevo `apex-closer`, separado del monorepo; se replica tema/estética.
- **2026-06-01** Marca: **solo logo Apex**, sin nombre de producto en la UI.
- **2026-06-01** IA (Orbe) = **por usuario** (SOUL/Memory/Context/Intention), aislada por `user_id`.
- **2026-06-01** Sin Tailwind: tokens CSS `var(--apex-*)` + 4 temas (igual que Apex Operations).
- **2026-06-01** es-first (mercado 100% hispano).
- **2026-06-01** IA = 4 secciones (Home · Llamadas · Pipeline · Ajustes). Transcripción dentro
  del detalle de llamada; seguimientos dentro del Pipeline; vídeo obligatorio en el detalle.
- **2026-06-01** Producto ampliado más allá del mínimo Fase 0 (decisión de Alex): **login con
  Google + landing pública**, **Finanzas**, **Reports**, filtros/objetivos en Home, Pipeline con
  vídeo. Auth = sesión propia vía `/api/auth` (Google OAuth) + fallback demo en local. Filtros y
  proyecciones comunes vía `lib/filters.js`.
- **2026-06-01** **Cliente = proyecto** (eje del producto). client_id en llamadas/leads/ventas/
  reports; filtro por cliente en todas las secciones. Sección Clientes con conversación persistida
  por cliente (`lib/conversations.js` → tabla `conversations`) + resumen/feedback. Nav = 7 secciones.
  Migración 0003. Siguiente acordado: **deploy**.
