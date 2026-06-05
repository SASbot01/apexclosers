# PDR — Proyecto inicial

> **Software sin nombre · Marca = logo Apex.** En toda la UI se muestra únicamente
> el mark Apex (chevron facetado); no hay wordmark ni nombre de producto.
> Documento de referencia (Product Design Requirements). Es la biblia del proyecto:
> toda implementación futura debe encajar aquí sin re-derivar arquitectura.

- **Repo (interno):** `/Users/alex/apex-closer`
- **Fuente a replicar:** `Apex Operations` → `/Users/alex/Apex-operations/src/pages/apex-operations/`
- **Estado:** esqueleto + PDR (sin código todavía)
- **Fecha:** 2026-06-01

---

## 1. Visión y posicionamiento

Software vertical para **closers de habla hispana** que gestiona el ciclo completo
de la llamada de venta. Entra por una cuña simple y barata (modelo de **tokens**),
crece por **afiliados** y comunidad, y deja la puerta abierta a una plataforma mayor
(Apex All-in-One) sin que eso condicione el producto inicial.

- **Mercado:** 100% habla hispana (España + LatAm).
- **Usuario operativo:** el **closer** (y, por arrastre, el director comercial / dueño).
- **Fricción de entrada:** mínima (alta self-serve, precio bajo, valor inmediato).
- **Marca:** solo-logo Apex. Aspiracional, premium, sin ruido.

## 2. Objetivo del proyecto inicial (Fase 0–1)

Dejar montado el **esqueleto + sistema de diseño + núcleo del closer**, listo para
construir features encima.

- **Job-to-be-done:** *"No vuelvo a perder una llamada de venta ni un seguimiento."*
- **North Star Metric:** llamadas de venta gestionadas / semana.
- **Momento de activación:** 1ª llamada transcrita + 1er follow-up generado en < 24 h
  desde el alta.

## 3. Usuarios y JTBD

| Usuario | Necesidad principal |
|---|---|
| **Closer** (primario) | Confirmar, transcribir y no perder seguimientos de sus llamadas; quedar como un profesional ante el dueño. |
| **Director comercial** | Ver cómo convierte el equipo; recibir feedback estructurado. |
| **Dueño / marketer** (secundario) | Recibir feedback del closer; entender el dolor real del lead. |

## 4. Alcance (MoSCoW)

### Must (Fase 0–1) — DENTRO
1. **Home / Panel del closer** — KPIs del día (llamadas, shows, cierres, follow-ups pendientes) + Orbe.
2. **Llamadas** — lista · confirmación · estado (agendada / realizada / no-show) · agenda (Google Calendar).
3. **Transcripciones** — transcripción por llamada; clasificador **solo-ventas**.
4. **Detalle de llamada** — resumen IA + **feedback estructurado** para el dueño/marketer.
5. **Seguimientos / Follow-ups** — cola, recordatorios, "no perder ninguno".
6. **Ajustes** — perfil · conexión de calendario · **medidor de tokens/uso**.
7. **Orbe** — asistente flotante (resúmenes, "qué llamadas tengo hoy", patrones).
8. **Plataforma** — auth gate + onboarding mínimo + sistema de tokens (cuota + overage).

### Should (Fase 1.5)
- **Mini-Pipeline / Leads** ligero para tracking llamada→cierre.
- Plantillas de follow-up; exportar resumen.

### Could (Fase 2)
- **Stripe** (billing/tokens), planes anuales, "pausar" en vez de cancelar.
- **Sistema de afiliados** (tracking, dashboard, payout sobre seat activo).

### Won't (por ahora — arquitectura lista, no implementado)
- Finance, Reports completos, Marketing/Ads, Fulfillment, Team.
- Upsell Apex All-in-One (Fase 4).

## 5. Stack tecnológico (réplica exacta de Apex Operations)

| Capa | Tecnología |
|---|---|
| Build / dev | **Vite 7** + `@vitejs/plugin-react` (alias `@` → `src`) |
| UI | **React 19**, **react-router-dom 7** (rutas anidadas + `<Outlet>`) |
| Animación / iconos / charts | **framer-motion**, **lucide-react**, **recharts** |
| Estilos | CSS propio con tokens `var(--apex-*)` + 4 temas vía `[data-theme]` — **sin Tailwind** |
| Datos | **Supabase** (`@supabase/supabase-js`) — mock-first → hooks después |
| IA | **Anthropic SDK** (resúmenes, feedback, Orbe) — con prompt caching |
| Llamadas | **Recall.ai** (bot graba + transcribe) vía funciones `/api` |
| Backend | Funciones serverless **Vercel** (`/api/*`) + crons |
| Desktop (opcional) | **Tauri 2** — config replicable, lista pero no obligatoria |

## 6. Sistema de diseño (réplica del "aspecto")

- **4 temas:** `dark` (default) · `light` · `obsidian` · `pizarra`. Conmutados por
  `[data-theme]` sobre `.apex-ops`, persistidos en `localStorage['apex_*_theme']`.
- **Shell:** topbar con **logo Apex** (chevron → selector de tema) · `FloatingHeader`
  sticky · `AtmosphericCanvas` (fondo cósmico solo en dark) · **`ApexOrb` flotante** ·
  footer compacto.
- **Componentes base reutilizables:** `.apex-card`, `HoverMenu`, `KpiTiles`,
  `SecondaryKpis`, `DeltaBadge`, `FilterBar`, `DateRangePopover`, `SalesFunnel`,
  `TemporalChart`.
- **Origen del CSS:** destilar `ApexOpsTheme.css` (45 KB) → `src/styles/ApexTheme.css`,
  quitando lo que no use el producto inicial.

### Reglas locked (no repetir errores)
- Sin `translateY`/scale en hover de cards (solo cambia `border-color`).
- Sin marcas de esquina tipo HUD.
- Dropdowns **opacos**, `z-index ≥ 500` (escapan al stacking de recharts).
- Números **Inter Tight 300–400**, `font-variant-numeric: tabular-nums`.
- Colores de estado **direccionales** (up = pos, down = neg), no "favorables".
- **Nunca** hardcodear hex/rgba en componentes → siempre `var(--apex-*)`.
- CSS compartido por ≥2 componentes vive en el theme global, no dentro de un componente.
- `isolation: isolate` en `.apex-card` para el layering de pseudo-elementos.

## 7. Branding

- Solo el mark Apex: `apex-mark-platinum.svg` (sobre dark) y `apex-mark-mono-white.svg`.
- Variantes disponibles en `src/assets/`: platinum · mono-white · mono · gold (reserva tier).
- **Sin nombre de software** en topbar, título, favicon-text ni copys.
- `document.title` puede quedar vacío o con el símbolo; favicon = `apex-mark-platinum.svg`.

## 8. Arquitectura

- `SECTIONS` array = **única fuente** de navegación (desktop + móvil). Añadir sección =
  1 entrada en `SECTIONS` + 1 `<Route>`.
- Rutas anidadas con `<ApexLayout>` + `<Outlet>`; providers en el shell
  (Theme, Auth, Store).
- **Mock-first** con la misma forma que las tablas de Supabase → swap a hooks trivial
  (`useCalls()`, `useFollowUps()`…).
- Stubs preparados para: **Recall**, **Stripe** (tokens/billing), **afiliados**, i18n (es-first).
- Config **Tauri** lista para empaquetar como app de escritorio si se decide.

### 8.1 IA / Orbe — diseñada desde el día 0, **por cada usuario**
El asistente (Orbe) **no es un añadido**: es un agente cognitivo con **Alma · Memoria ·
Contexto · Intención** (+ Manos/tools, Seguridad, Evals), e **instanciado por cada nuevo
usuario** (alma base compartida + overlay por `user_id`; memoria persistente y aislada;
cold-start en onboarding). Es la palanca directa contra el churn (riesgo nº1) y el motor del
LTV. Arquitectura completa en **[`docs/ai/`](./docs/ai/README.md)**:
`00 cognitive-arch · 01 soul · 02 memory · 03 context · 04 intention · 05 tools ·
06 personalization-per-user · 07 safety/isolation · 08 evals`.
Regla nº1: **un usuario = un Orbe**, cero filtración entre usuarios (misma disciplina de
aislamiento que entre perfiles de cliente en Apex). Transcripciones = input no confiable
(defensa anti-inyección en `07`).

## 9. Modelo de datos inicial (mock-first → Supabase)

| Entidad | Notas (forma espejo de prod) |
|---|---|
| `calls` | ≈ `recall_calls`: estado, calendar_event_id, tipo (venta/admisión), tiempos. |
| `transcripts` | texto + segmentos por llamada; `call_id`. |
| `call_summaries` | resumen IA + **feedback** estructurado; `call_id`. |
| `follow_ups` | cola de seguimientos: due_at, estado, lead_id, call_id. |
| `leads` / `contacts` | mini-pipeline: nombre, contacto, etapa, valor. |
| `users` | closer (perfil, calendario conectado). |
| `token_usage` | medidor: horas transcritas, tokens LLM, cuota, overage. |

## 10. Integraciones

| Integración | Fase | Para qué |
|---|---|---|
| **Recall.ai** | 0 (crítica) | bot que entra a la call, graba y transcribe. Política solo-ventas + `automatic_leave` (no-show). |
| **Google Calendar** | 0–1 | agenda y confirmación de llamadas. |
| **Anthropic** | 1 | resúmenes, feedback al dueño, Orbe (prompt caching). |
| **Stripe** | 2 | tokens / suscripción, overage, planes anuales. |
| **Afiliados** | 2–3 | tracking, dashboard, payout sobre seat activo. |

## 11. Estructura de carpetas

```
apex-closer/
  PDR.md · README.md
  docs/                          decisiones, especificaciones por fase
  api/                           funciones serverless (Vercel)
    recall/                      crear bot · webhooks · reconcile
    calendar/                    Google Calendar (agenda/confirmación)
    summaries/                   resumen IA + feedback (Anthropic)
    _lib/                        helpers compartidos (recall, classifier, supabase)
  public/                        favicon (logo Apex), estáticos
  src/
    main.jsx · App.jsx           (futuro) entrypoint + shell mount
    shell/                       ApexLayout · AtmosphericCanvas · ApexOrb · ThemeContext
    styles/                      ApexTheme.css (destilado) + mobile
    components/                  HoverMenu · KpiTiles · DeltaBadge · FilterBar · FloatingHeader
      charts/                    TemporalChart · SalesFunnel (recharts)
    pages/
      home/                      panel del closer
      calls/                     lista + confirmación + estado
      transcripts/               transcripción por llamada
      call-detail/               resumen IA + feedback
      follow-ups/                cola de seguimientos
      pipeline/                  mini-pipeline (Should)
      settings/                  perfil · calendario · tokens
      onboarding/                alta mínima
    data/
      mock/                      datos mock (forma = Supabase)
      hooks/                     useCalls/useFollowUps… (swap a Supabase)
    lib/                         supabaseClient · recall · anthropic · tokens
    assets/                      apex-mark-*.svg
```

## 12. Roadmap de implementación (mapea al roadmap de negocio)

| Fase | Foco | Entrega de software | Puerta |
|---|---|---|---|
| **0 — Cimientos / Dogfood** | que funcione para Alex | scaffold real (Vite+React+tema+shell+logo) · Recall conectado · Llamadas + Transcripciones + Detalle | un día de venta entero pasa por la app sin romperse |
| **1 — Oferta + 10 socios** | prueba, no ingresos | Follow-ups · feedback IA · Orbe · onboarding · medidor de tokens | ≥10 closers a diario + 3 testimonios + retención sem.4 |
| **2 — Monetización** | unit economics | Stripe (tokens) · afiliados v1 · landing 2 pasos | ~50 seats de pago · COGS/LTV/CAC reales · break-even a la vista |
| **3 — Saturación** | flywheel | tiers afiliados · academias super-afiliado · automatización onboarding | ~600 seats · churn < 8% |
| **4 — Escala / Plataforma** | techo + opcionalidad | LatAm · upsell All-in-One · Apex for Marketing | ~2.000 seats · ARR ~1,9M€ |

## 13. Modelo de negocio (resumen)

- **Precio:** Token **x3** (~79€/mes) — la "x" extra financia el motor de afiliados.
- **Token, no tarifa plana:** cuota incluida (~30 h transcripción) + **overage** → COGS blindado.
- **Afiliados:** 30% recurrente sobre **seat activo** (no sobre altas), tiers por volumen,
  academias como super-afiliado (override 10–15%). Pagado desde ingresos cobrados (CAC diferido).
- **Unit economics base:** precio 79€ · COGS ~27€ · margen bruto ~66% · LTV ~375€ (churn 8%) ·
  break-even ~170–235 seats.

## 14. Riesgos / decisiones abiertas

- **Churn del closer** (#1) → planes anuales, "pausar", anclaje al día a día.
- **COGS escala con uso** → token metering obligatorio desde día 1.
- **Dependencia Recall.ai** → abstraer la capa de transcripción (`lib/recall`).
- **Fiabilidad del producto** → la viralidad amplifica lo bueno y lo malo.
- **WTP en LatAm** → considerar pricing regional / USD.
- **Abierto:** ¿multi-tenant desde el inicio o single-tenant + cuentas? (recom.: cuentas
  de closer simples ahora, `BasePathContext` listo por si se reusa el shell).

## 15. Convenciones de desarrollo (heredadas de Apex Operations)

- Mock-first; la forma de los mocks **espeja** las tablas de Supabase.
- Una sección nueva = `pages/<x>/` + entrada en `SECTIONS` + `<Route>`.
- Reutilizar componentes base; no recrear nav móvil/desktop por separado.
- Variables de layout: `--apex-topbar-h`, safe-area-insets para PWA/iOS.
- es-first en copys (mercado 100% hispano).

## Apéndice — Piezas existentes a portar desde el monorepo

Estas ya existen en `/Users/alex/Apex-operations/` y sirven de base directa:

- **Tema / shell:** `src/styles/ApexOpsTheme.css` · `src/pages/apex-operations/{ApexLayout,ApexOperationsApp,ThemeContext}.jsx` · `components/{AtmosphericCanvas,FloatingHeader,HoverMenu,KpiTiles,DeltaBadge,FilterBar,SecondaryKpis,SalesFunnel,TemporalChart}.jsx`
- **Orbe:** `components/ApexOrb.jsx` · `components/tools/{OrbePage,OrbePlaybookPage}.jsx` · `components/tools/orbe.css`
- **Llamadas / transcripciones:** `components/tools/{ApexCallsPage,CallView,TranscriptsView,TranscriptAnalyzerPage}.jsx` + `apex-calls.css` · `call-view.css` · `transcripts.css`
- **Recall backend:** `api/recall.js` · `api/_lib/recall.js` · `api/_lib/callClassifier.js`
- **Logo:** `~/Desktop/apex-brand/apex-mark-*.svg` (ya copiados a `src/assets/`)
