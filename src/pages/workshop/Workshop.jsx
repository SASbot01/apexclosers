import { useState, useRef, useEffect } from 'react'
import { Award, Ear, MessageSquare, Send, Plus, Loader2, Check, ArrowRight, AlertTriangle, Sparkles, TrendingUp, TrendingDown, RefreshCw, Target } from 'lucide-react'
import FloatingHeader from '../../components/FloatingHeader'
import FilterBar, { SelectFilter } from '../../components/Filters'
import HoverMenu from '../../components/HoverMenu'
import CountUp from '../../components/CountUp'
import SkillHex from '../../components/SkillHex'
import { CLIENT_OPTIONS } from '../../data/mock/clients'
import {
  EVOLUTION, METRIC_OPTIONS, evoSeries, GRANS, deriveWorkshop, deriveBottleneck, CLOSER_TYPE, TALK_PCT, CALLS_ANALYZED,
  AI_READOUT, SEED_CHATS,
} from '../../data/mock/workshop'
import { API_BASE, getUserId } from '../../lib/config'
import { getWorkshop, listCoachChats, saveCoachChat, deleteCoachChat } from '../../lib/workshopApi'

/*
 * Workshop — la sección de IA: transformamos las transcripciones en un mapa de
 * habilidades (hexagrama vivo), métricas de estilo (habla/escucha, tipo de
 * closer), la evolución de cualquier métrica en el tiempo, la lectura de la IA
 * y un chat-coach con conversaciones guardadas. Filtros de cliente y periodo
 * arriba; filtro de métrica en el histograma. Datos demo; chat vía /api/orbe.
 */
const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const pct = (v) => `${Math.round((v || 0) * 100)}%`
const CKEY = 'apex_closer_workshop_chats'
const readChats = () => { try { const r = JSON.parse(localStorage.getItem(CKEY)); return Array.isArray(r) && r.length ? r : SEED_CHATS } catch { return SEED_CHATS } }
const writeChats = (l) => { try { localStorage.setItem(CKEY, JSON.stringify(l)) } catch { /* off */ } }

function demoReply(q) {
  return `Sobre "${q.slice(0, 64)}"… Mirando tus ${CALLS_ANALYZED} llamadas: tu punto fuerte es Cierre (93%) y donde más ganas tienes es Objeciones (55%). Hablas un ${pct(TALK_PCT)} del tiempo (lo ideal para tu estilo ${CLOSER_TYPE.toLowerCase()} es escuchar más). Empezaría por ahí.\n\n(Demo — con el backend de IA conectado te respondo con tus transcripciones reales.)`
}

export default function Workshop() {
  const [period, setPeriod] = useState('this_year')
  const [client, setClient] = useState('all')
  const [metric, setMetric] = useState('close_rate')
  const [gran, setGran] = useState('mes')
  const [remote, setRemote] = useState(null)   // datos reales del backend (o null → demo)
  const [nonce, setNonce] = useState(0)

  // Carga los datos reales del Workshop (habilidades, estilo, evolución…). Si no
  // hay backend, se queda en null y la página cae a los datos demo deterministas.
  useEffect(() => {
    let alive = true
    getWorkshop(period, client)
      .then(r => { if (alive) setRemote(r) })
      .catch(() => { if (alive) setRemote(null) })
    return () => { alive = false }
  }, [period, client, nonce])
  const reload = () => setNonce(n => n + 1)

  // Datos reales si hay backend; si no, demo determinista por filtros.
  const d = remote || deriveWorkshop(client, period)

  // Evolución, cuello de botella y lectura IA: del backend o del catálogo demo.
  const metricOptions = remote?.evolution
    ? Object.entries(remote.evolution).map(([key, v]) => ({ key, label: v.label }))
    : METRIC_OPTIONS
  const ev = (remote?.evolution || EVOLUTION)[metric] || EVOLUTION[metric] || EVOLUTION.close_rate
  const series = remote?.evolution?.[metric]?.series?.[gran] || evoSeries(metric, gran, d.seed || 0)
  const bottleneck = remote?.bottleneck || deriveBottleneck(d)
  const readout = remote?.readout || AI_READOUT
  const first = series[0]?.[1] ?? 0
  const last = series[series.length - 1]?.[1] ?? 0
  const delta = last - first
  const deltaStr = ev.fmt === 'pct' ? `${delta >= 0 ? '+' : ''}${Math.round(delta * 100)} pts`
    : ev.fmt === 'money' ? `${delta >= 0 ? '+' : ''}${money(delta)}` : `${delta >= 0 ? '+' : ''}${delta}`

  const tlBar = (
    <div className="ws-tlbar">
      <span className="ws-tlbar-talk" style={{ width: pct(d.talk) }} />
      <span className="ws-tlbar-listen" style={{ width: pct(d.listen) }} />
    </div>
  )
  const stats = [
    { label: 'Llamadas analizadas', value: d.calls },
    { label: 'Horas transcritas', value: d.hours, suffix: ' h' },
    { label: 'Palabras procesadas', value: Math.round(d.words / 1000), suffix: 'K' },
    { label: 'Preguntas / llamada', value: d.questions, decimals: 1 },
  ]
  const insights = [
    { Icon: Award, label: 'Tipo de closer', value: d.closer.name, sub: d.closer.desc },
    { Icon: Ear, label: 'Habla vs escucha', value: <><CountUp value={Math.round(d.talk * 100)} suffix="%" /> / <CountUp value={Math.round(d.listen * 100)} suffix="%" /></>, sub: tlBar },
    { Icon: MessageSquare, label: 'Objeción frecuente', value: d.objection, sub: 'la más repetida' },
  ]

  return (
    <>
      <FloatingHeader title="Workshop" eyebrow="IA · TUS HABILIDADES" actions={
        <FilterBar time={period} onTime={setPeriod}>
          <SelectFilter label="Cliente" value={client} options={CLIENT_OPTIONS} onChange={setClient} />
        </FilterBar>
      } />

      <section className="apex-section">
        <BottleneckCard data={bottleneck} onRefresh={reload} />
      </section>

      <section className="apex-section">
        <div className="ws-stats">
          {stats.map((s, i) => (
            <div className="apex-card ws-stat" key={i}>
              <span className="ws-stat-label">{s.label}</span>
              <span className="ws-stat-value"><CountUp value={s.value} suffix={s.suffix || ''} decimals={s.decimals || 0} /></span>
            </div>
          ))}
        </div>
      </section>

      <section className="apex-section">
        <div className="ws-insights">
          {insights.map((it, i) => (
            <div className="apex-card ws-insight" key={i}>
              <span className="ws-insight-ic"><it.Icon size={20} strokeWidth={1.7} /></span>
              <div>
                <div className="ws-insight-label">{it.label}</div>
                <div className="ws-insight-value">{it.value}</div>
                <div className="ws-insight-sub">{it.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Hexagrama de habilidades + evolución de una métrica — misma fila */}
      <section className="apex-section ws-main">
        <div className="apex-card ws-panel ws-glow-border">
          <span className="ws-h"><span className="ws-live-dot" /> Análisis con IA · tus habilidades</span>
          <SkillHex skills={d.skills} />
          <p className="ws-note">Transformamos tus transcripciones en datos con IA.</p>
        </div>

        <div className="apex-card ws-panel">
          <div className="ws-h-row">
            <span className="ws-h" style={{ margin: 0 }}>Evolución
              <span className="ws-trend" data-up={delta >= 0 || undefined}>
                {delta >= 0 ? <TrendingUp size={12} strokeWidth={2} /> : <TrendingDown size={12} strokeWidth={2} />} {deltaStr}
              </span>
            </span>
            <div className="ws-ev-controls">
              <div className="seg">
                {GRANS.map(g => (
                  <button key={g.key} type="button" className="seg-btn" data-active={gran === g.key || undefined} onClick={() => setGran(g.key)}>{g.label}</button>
                ))}
              </div>
              <HoverMenu label="Métrica" value={ev.label}>
                {metricOptions.map(o => (
                  <HoverMenu.Item key={o.key} selected={o.key === metric} onSelect={() => setMetric(o.key)}>{o.label}</HoverMenu.Item>
                ))}
              </HoverMenu>
            </div>
          </div>
          <EvolutionChart series={series} fmt={ev.fmt} />
          <p className="ws-note" style={{ textAlign: 'left' }}>{ev.label} · evolución en el periodo.</p>
        </div>
      </section>

      {/* Resultados (donut) + tono y ritmo — misma fila */}
      <section className="apex-section ws-main">
        <div className="apex-card ws-panel">
          <span className="ws-h">Resultados de tus llamadas</span>
          <Donut segments={d.outcomes} />
        </div>
        <div className="apex-card ws-panel">
          <span className="ws-h">Tono y ritmo</span>
          <div className="ws-tone-dom">Tono dominante: <b>{d.dominantTone}</b></div>
          <div className="ws-tones">
            {d.tones.map(t => (
              <div key={t.label}>
                <div className="ws-tone-top"><span>{t.label}</span><span className="ws-tone-v">{t.value}%</span></div>
                <div className="ws-tone-track"><div className="ws-tone-fill" style={{ width: `${t.value}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="ws-pace">
            <span className="ws-pace-label">Ritmo de habla</span>
            <span className="ws-pace-v"><CountUp value={d.wpm} /> <small>wpm · ideal 110-150</small></span>
          </div>
        </div>
      </section>

      <section className="apex-section ws-readout">
        <ReadoutCard title="Lo que mejor haces" items={readout.strengths} tone="pos" delay={0} />
        <ReadoutCard title="Dónde pierdes" items={readout.weaknesses} tone="neg" delay={300} />
        <ReadoutCard title="Tu plan ahora" items={readout.next} tone="plan" delay={600} />
      </section>

      <section className="apex-section">
        <WorkshopChat />
      </section>

      <style>{WS_CSS}</style>
    </>
  )
}

// Cuello de botella principal + acción de mayor palanca, con IA y botón Actualizar.
// El análisis sale de las transcripciones (en demo, determinista por filtros). El
// botón re-analiza: intenta el backend de IA (/api/orbe) y cae a los datos demo.
function BottleneckCard({ data, onRefresh }) {
  const [analyzing, setAnalyzing] = useState(false)
  const b = data   // se re-deriva solo al cambiar los filtros (cliente/periodo)

  const refresh = async () => {
    if (analyzing) return
    setAnalyzing(true)
    const minSpin = new Promise(r => setTimeout(r, 1200))   // que se note el re-análisis
    // Re-pide el análisis real: el backend puntúa las llamadas pendientes y
    // recalcula el cuello de botella con las transcripciones.
    try { await onRefresh?.() } catch { /* sin backend → datos demo */ }
    await minSpin
    setAnalyzing(false)
  }

  return (
    <div className="apex-card ws-bn ws-glow-border">
      <div className="ws-bn-top">
        <span className="ws-h" style={{ margin: 0 }}><span className="ws-live-dot" /> Análisis IA · cuello de botella</span>
        <button type="button" className="ws-bn-refresh" onClick={refresh} disabled={analyzing}>
          {analyzing ? <Loader2 size={13} className="apex-spin" /> : <RefreshCw size={13} strokeWidth={2} />}
          {analyzing ? 'Analizando…' : 'Actualizar'}
        </button>
      </div>

      <div className="ws-bn-body" data-analyzing={analyzing || undefined}>
        <div className="ws-bn-head">
          <span className="ws-bn-ic"><AlertTriangle size={22} strokeWidth={1.8} /></span>
          <div className="ws-bn-headtext">
            <div className="ws-bn-eyebrow">Tu restricción principal</div>
            <div className="ws-bn-area">{b.headline}</div>
            <p className="ws-bn-diag">{b.diagnosis}</p>
          </div>
          <div className="ws-bn-score">
            <span className="ws-bn-score-v">{pct(b.value)}</span>
            <span className="ws-bn-score-l">nivel actual</span>
          </div>
        </div>

        <div className="ws-bn-action">
          <span className="ws-bn-action-tag"><Target size={13} strokeWidth={2.2} /> La acción de mayor palanca</span>
          <p className="ws-bn-action-txt">{b.action}</p>
          <p className="ws-bn-why"><ArrowRight size={12} strokeWidth={2.2} /> {b.why}</p>
        </div>

        <div className="ws-bn-impact">
          <div className="ws-bn-chip"><span className="ws-bn-chip-v">+{b.liftPts} pts</span><span className="ws-bn-chip-l">close rate</span></div>
          <div className="ws-bn-chip"><span className="ws-bn-chip-v">+{money(b.revLift)}</span><span className="ws-bn-chip-l">proyectado / periodo</span></div>
          <div className="ws-bn-chip"><span className="ws-bn-chip-v">+{b.extraDeals}</span><span className="ws-bn-chip-l">cierres extra</span></div>
          <span className="ws-bn-conf">Confianza IA {b.confidence}%</span>
        </div>
      </div>

      {analyzing && <div className="ws-bn-overlay"><Loader2 size={16} className="apex-spin" /> Analizando tus transcripciones…</div>}
    </div>
  )
}

function EvolutionChart({ series, fmt }) {
  const max = Math.max(...series.map(s => s[1]), fmt === 'pct' ? 0.0001 : 1)
  const fmtV = (v) => fmt === 'pct' ? `${Math.round(v * 100)}%` : fmt === 'money' ? money(v) : `${v}`
  return (
    <div className="ws-ev">
      {series.map(([t, v], i) => (
        <div className="ws-ev-col" key={i}>
          <span className="ws-ev-val">{fmtV(v)}</span>
          <div className="ws-ev-track">
            <div className="ws-ev-fill" style={{ height: `${Math.max(4, (v / max) * 100)}%`, animationDelay: `${(i * 0.06).toFixed(2)}s` }} />
          </div>
          <span className="ws-ev-label">{t}</span>
        </div>
      ))}
    </div>
  )
}

function Donut({ segments }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1
  const R = 54, SW = 16, CC = 70, c = 2 * Math.PI * R
  const COLORS = {
    won: 'var(--apex-accent, var(--apex-plat-hi))',
    follow: 'color-mix(in srgb, var(--apex-accent, var(--apex-plat-mid)) 45%, transparent)',
    lost: 'var(--apex-status-neg)',
    noshow: 'var(--apex-plat-shad)',
  }
  let acc = 0
  return (
    <div className="ws-donut-wrap">
      <svg viewBox="0 0 140 140" className="ws-donut">
        <circle cx={CC} cy={CC} r={R} fill="none" stroke="var(--apex-alpha-3)" strokeWidth={SW} />
        {segments.map(s => {
          const frac = s.value / total
          const node = (
            <circle key={s.key} cx={CC} cy={CC} r={R} fill="none" stroke={COLORS[s.key]} strokeWidth={SW}
              strokeDasharray={`${(frac * c).toFixed(1)} ${c.toFixed(1)}`} strokeDashoffset={(-acc * c).toFixed(1)}
              transform={`rotate(-90 ${CC} ${CC})`} />
          )
          acc += frac
          return node
        })}
        <text x={CC} y={CC - 3} textAnchor="middle" className="ws-donut-num">{total}</text>
        <text x={CC} y={CC + 13} textAnchor="middle" className="ws-donut-lbl">llamadas</text>
      </svg>
      <div className="ws-legend">
        {segments.map(s => (
          <div className="ws-legend-row" key={s.key}>
            <span className="ws-legend-dot" data-k={s.key} />
            <span className="ws-legend-l">{s.label}</span>
            <span className="ws-legend-v">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReadoutCard({ title, items, tone, delay = 0 }) {
  const Icon = tone === 'pos' ? Check : tone === 'neg' ? AlertTriangle : ArrowRight
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (shown >= items.length) return
    const t = setTimeout(() => setShown(s => s + 1), shown === 0 ? 450 + delay : 650)
    return () => clearTimeout(t)
  }, [shown, items.length, delay])
  const analyzing = shown < items.length
  return (
    <div className="apex-card ws-ro" data-tone={tone}>
      <span className="ws-h">{title}{analyzing && <span className="ws-ro-an">analizando…</span>}</span>
      <div className="ws-ro-list">
        {items.slice(0, shown).map((t, i) => (
          <div className="ws-ro-row" key={i}>
            <span className="ws-ro-ic"><Icon size={13} strokeWidth={2.2} /></span>
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function WorkshopChat() {
  const [chats, setChats] = useState(readChats)
  const [activeId, setActiveId] = useState(() => readChats()[0]?.id)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef(null)
  const active = chats.find(c => c.id === activeId) || chats[0]

  const persist = (next) => { setChats(next); writeChats(next) }
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight }, [active?.messages.length, busy, activeId])

  // Carga los hilos guardados del backend (si hay). Sustituyen a los locales.
  useEffect(() => {
    let alive = true
    listCoachChats().then(list => {
      if (!alive || !list.length) return
      const norm = list.map(c => ({ id: c.id, title: c.title, messages: c.messages || [], created_at: c.created_at }))
      setChats(norm); writeChats(norm)
      setActiveId(a => norm.find(c => c.id === a) ? a : norm[0].id)
    }).catch(() => { /* sin backend → localStorage */ })
    return () => { alive = false }
  }, [])

  // Persiste un hilo en el backend; si era id local, adopta el uuid devuelto.
  const syncChat = (chat) => {
    saveCoachChat({ id: chat.id, title: chat.title, messages: chat.messages }).then(saved => {
      if (!saved || saved.id === chat.id) return
      setChats(cur => { const upd = cur.map(c => c.id === chat.id ? { ...c, id: saved.id } : c); writeChats(upd); return upd })
      setActiveId(cur => cur === chat.id ? saved.id : cur)
    }).catch(() => { /* best-effort */ })
  }

  function newConversation() {
    const conv = { id: 'w' + Date.now(), title: 'Conversación', messages: [], created_at: new Date().toISOString() }
    persist([conv, ...chats]); setActiveId(conv.id)
  }

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    const userMsg = { role: 'user', body: text, ts: Date.now() }
    const history = [...active.messages, userMsg]
    const afterUser = chats.map(c => c.id === active.id
      ? { ...c, messages: history, title: (!c.title || c.title === 'Conversación') ? text.slice(0, 42) : c.title }
      : c)
    persist(afterUser); setInput(''); setBusy(true)
    let reply
    try {
      const res = await fetch(`${API_BASE}/api/orbe?action=chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: getUserId(), messages: history.map(m => ({ role: m.role, body: m.body })) }),
      })
      const data = await res.json().catch(() => ({}))
      reply = res.ok && data.reply ? data.reply : demoReply(text)
    } catch { reply = demoReply(text) }
    const aMsg = { role: 'assistant', body: reply, ts: Date.now() }
    const finalMessages = [...history, aMsg]
    setChats(cur => { const upd = cur.map(c => c.id === active.id ? { ...c, messages: [...c.messages, aMsg] } : c); writeChats(upd); return upd })
    setBusy(false)
    // Guarda el hilo completo en el backend (best-effort).
    syncChat({ id: active.id, title: (!active.title || active.title === 'Conversación') ? text.slice(0, 42) : active.title, messages: finalMessages })
  }

  return (
    <div className="apex-card ws-chat ws-glow-border">
      <aside className="ws-chat-list">
        <button className="ws-chat-new" onClick={newConversation}><Plus size={14} strokeWidth={2} /> Nueva conversación</button>
        <div className="ws-chat-threads">
          {chats.map(c => (
            <button key={c.id} className="ws-chat-item" data-active={c.id === active?.id || undefined} onClick={() => setActiveId(c.id)}>
              <span className="ws-chat-item-t">{c.title || 'Conversación'}</span>
              <span className="ws-chat-item-n">{c.messages.length} mensajes</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="ws-chat-main">
        <div className="ws-chat-body" ref={bodyRef}>
          {(!active || active.messages.length === 0) && (
            <div className="ws-chat-empty">
              <Sparkles size={24} strokeWidth={1.5} />
              <h4>Tu coach de ventas con IA</h4>
              <p>Pregunta por tus habilidades, objeciones o un plan de mejora. Tus conversaciones se guardan y puedes volver a ellas.</p>
            </div>
          )}
          {active?.messages.map((m, i) => (
            <div key={i} className={`ws-msg ws-msg--${m.role}`}><div className="ws-bubble">{m.body}</div></div>
          ))}
          {busy && <div className="ws-msg ws-msg--assistant"><div className="ws-bubble ws-bubble--think"><Loader2 size={12} className="apex-spin" /> Pensando…</div></div>}
        </div>
        <form className="ws-chat-form" onSubmit={e => { e.preventDefault(); send() }}>
          <textarea className="ws-chat-input" rows={1} placeholder="Pregunta a tu coach…" value={input}
            onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} disabled={busy} />
          <button type="submit" className="ws-chat-send" disabled={busy || !input.trim()} aria-label="Enviar">
            {busy ? <Loader2 size={14} className="apex-spin" /> : <Send size={14} strokeWidth={1.8} />}
          </button>
        </form>
      </div>
    </div>
  )
}

const WS_CSS = `
/* Cuello de botella (hero IA) */
.ws-bn { position: relative; padding: 22px 24px; overflow: hidden; }
.ws-bn-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.ws-bn-refresh { display: inline-flex; align-items: center; gap: 7px; font-family: var(--apex-font); font-size: 12px; color: var(--apex-accent-ink, var(--apex-bg)); background: var(--apex-accent, var(--apex-plat-hi)); border: 0; border-radius: var(--apex-radius-pill, 999px); padding: 7px 14px; cursor: pointer; box-shadow: 0 0 14px color-mix(in srgb, var(--apex-accent, transparent) 40%, transparent); transition: filter 0.18s, opacity 0.18s; }
.ws-bn-refresh:hover:not(:disabled) { filter: brightness(1.08); }
.ws-bn-refresh:disabled { opacity: 0.7; cursor: progress; }
.ws-bn-body { transition: filter 0.3s, opacity 0.3s; }
.ws-bn-body[data-analyzing] { filter: blur(3px) saturate(0.6); opacity: 0.5; pointer-events: none; }
.ws-bn-head { display: flex; align-items: flex-start; gap: 16px; }
.ws-bn-ic { display: inline-flex; align-items: center; justify-content: center; width: 46px; height: 46px; flex: 0 0 46px; border-radius: 12px; background: color-mix(in srgb, var(--apex-accent, var(--apex-status-neg)) 14%, transparent); color: var(--apex-accent, var(--apex-plat-hi)); border: 1px solid color-mix(in srgb, var(--apex-accent, var(--apex-border-strong)) 35%, transparent); }
.ws-bn-headtext { flex: 1; min-width: 0; }
.ws-bn-eyebrow { font-family: var(--apex-font-mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--apex-plat-low); }
.ws-bn-area { font-size: 24px; color: var(--apex-plat-hi); line-height: 1.15; margin-top: 3px; }
.ws-bn-diag { font-size: 13px; color: var(--apex-plat-mid); line-height: 1.55; margin: 8px 0 0; max-width: 70ch; }
.ws-bn-score { text-align: right; flex: 0 0 auto; }
.ws-bn-score-v { display: block; font-size: 32px; color: var(--apex-accent, var(--apex-plat-hi)); font-variant-numeric: tabular-nums; line-height: 1; }
.ws-bn-score-l { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--apex-plat-low); }
.ws-bn-action { margin-top: 18px; padding: 16px 18px; border-radius: var(--apex-radius-sm, 12px); background: var(--apex-accent-soft, var(--apex-alpha-2)); border: 1px solid color-mix(in srgb, var(--apex-accent, var(--apex-border-strong)) 30%, var(--apex-border)); }
.ws-bn-action-tag { display: inline-flex; align-items: center; gap: 7px; font-family: var(--apex-font-mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--apex-accent, var(--apex-plat-mid)); }
.ws-bn-action-txt { font-size: 15px; color: var(--apex-plat-hi); line-height: 1.5; margin: 9px 0 0; }
.ws-bn-why { display: flex; align-items: flex-start; gap: 6px; font-size: 12px; color: var(--apex-plat-low); line-height: 1.5; margin: 8px 0 0; }
.ws-bn-why svg { flex: 0 0 auto; margin-top: 3px; color: var(--apex-accent, var(--apex-plat-mid)); }
.ws-bn-impact { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
.ws-bn-chip { display: flex; flex-direction: column; gap: 2px; padding: 9px 16px; border-radius: var(--apex-radius-sm, 10px); border: 1px solid var(--apex-border); background: var(--apex-trigger-bg); }
.ws-bn-chip-v { font-size: 17px; color: var(--apex-accent, var(--apex-plat-hi)); font-variant-numeric: tabular-nums; line-height: 1; }
.ws-bn-chip-l { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--apex-plat-low); }
.ws-bn-conf { margin-left: auto; font-size: 11px; color: var(--apex-plat-low); }
.ws-bn-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 9px; font-size: 13px; color: var(--apex-accent, var(--apex-plat-hi)); z-index: 4; }

.ws-insights { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.ws-insight { display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-left: 3px solid var(--apex-accent, var(--apex-plat-mid)); }
.ws-insight-ic { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; flex: 0 0 40px; border-radius: 10px; background: var(--apex-accent-soft, var(--apex-alpha-2)); color: var(--apex-accent, var(--apex-plat-hi)); }
.ws-insight-label { font-size: 11.5px; color: var(--apex-plat-low); }
.ws-insight-value { font-size: 21px; color: var(--apex-plat-hi); line-height: 1.2; margin-top: 2px; }
.ws-insight-sub { font-size: 12px; color: var(--apex-accent, var(--apex-plat-mid)); margin-top: 2px; }
.ws-tlbar { display: flex; height: 6px; width: 150px; max-width: 100%; margin-top: 7px; border-radius: 999px; overflow: hidden; background: var(--apex-alpha-2); }
.ws-tlbar-talk { background: var(--apex-plat-shad); }
.ws-tlbar-listen { background: var(--apex-accent, var(--apex-plat-hi)); box-shadow: 0 0 8px color-mix(in srgb, var(--apex-accent, transparent) 45%, transparent); }
.ws-trend { display: inline-flex; align-items: center; gap: 4px; margin-left: 10px; font-family: var(--apex-font); font-size: 11px; letter-spacing: 0; text-transform: none; color: var(--apex-status-neg); }
.ws-trend[data-up] { color: var(--apex-accent, var(--apex-status-pos)); }
.ws-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.ws-stat { padding: 16px 20px; display: flex; flex-direction: column; gap: 6px; }
.ws-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--apex-plat-low); }
.ws-stat-value { font-size: 26px; color: var(--apex-plat-hi); font-variant-numeric: tabular-nums; line-height: 1; }

/* Donut de resultados */
.ws-donut-wrap { flex: 1; display: flex; align-items: center; justify-content: center; gap: 22px; flex-wrap: wrap; padding: 8px 0; }
.ws-donut { width: 150px; height: 150px; flex: 0 0 150px; }
.ws-donut-num { fill: var(--apex-plat-hi); font-family: var(--apex-font); font-size: 26px; }
.ws-donut-lbl { fill: var(--apex-plat-low); font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; }
.ws-legend { display: flex; flex-direction: column; gap: 9px; min-width: 150px; }
.ws-legend-row { display: flex; align-items: center; gap: 9px; font-size: 12.5px; color: var(--apex-plat-mid); }
.ws-legend-dot { width: 9px; height: 9px; border-radius: 2px; flex: 0 0 9px; }
.ws-legend-dot[data-k="won"] { background: var(--apex-accent, var(--apex-plat-hi)); }
.ws-legend-dot[data-k="follow"] { background: color-mix(in srgb, var(--apex-accent, var(--apex-plat-mid)) 45%, transparent); }
.ws-legend-dot[data-k="lost"] { background: var(--apex-status-neg); }
.ws-legend-dot[data-k="noshow"] { background: var(--apex-plat-shad); }
.ws-legend-v { margin-left: auto; color: var(--apex-plat-hi); font-variant-numeric: tabular-nums; }

/* Tono / ritmo */
.ws-tone-dom { font-size: 12.5px; color: var(--apex-plat-low); margin-bottom: 14px; }
.ws-tone-dom b { color: var(--apex-accent, var(--apex-plat-hi)); }
.ws-tones { display: flex; flex-direction: column; gap: 14px; flex: 1; justify-content: center; }
.ws-tone-top { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--apex-plat-mid); margin-bottom: 6px; }
.ws-tone-v { color: var(--apex-plat-hi); font-variant-numeric: tabular-nums; }
.ws-tone-track { height: 8px; background: var(--apex-alpha-2); border-radius: 999px; overflow: hidden; }
.ws-tone-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, color-mix(in srgb, var(--apex-accent, var(--apex-plat-mid)) 50%, transparent), var(--apex-accent, var(--apex-plat-hi))); box-shadow: 0 0 8px color-mix(in srgb, var(--apex-accent, transparent) 40%, transparent); }
.ws-pace { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--apex-alpha-3); }
.ws-pace-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--apex-plat-low); }
.ws-pace-v { font-size: 22px; color: var(--apex-plat-hi); font-variant-numeric: tabular-nums; }
.ws-pace-v small { font-size: 11px; color: var(--apex-plat-low); }

.apex-section.ws-main { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: stretch; }
.ws-panel { padding: 20px 22px; display: flex; flex-direction: column; }
.ws-h { display: flex; align-items: center; font-family: var(--apex-font-mono); font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--apex-plat-low); margin-bottom: 14px; }
.ws-h-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.ws-ev-controls { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ws-note { font-size: 12px; color: var(--apex-plat-low); line-height: 1.5; text-align: center; margin: 12px 0 0; }
.ws-live-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 8px; background: var(--apex-accent, var(--apex-plat-mid)); box-shadow: 0 0 8px var(--apex-accent, transparent); animation: ws-live 1.6s ease-in-out infinite; }
@keyframes ws-live { 0%, 100% { opacity: 0.35; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.15); } }

/* Histograma de evolución con reflejo neón */
.ws-ev { flex: 1; display: flex; align-items: stretch; gap: 14px; min-height: 240px; padding-top: 4px; }
.ws-ev-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.ws-ev-val { font-size: 12.5px; color: var(--apex-plat-hi); font-variant-numeric: tabular-nums; }
.ws-ev-track { position: relative; width: 100%; flex: 1; min-height: 0; }
.ws-ev-fill { position: absolute; left: 20%; right: 20%; bottom: 0; min-height: 4px; border-radius: 6px 6px 0 0; overflow: hidden;
  background: linear-gradient(180deg, var(--apex-accent, var(--apex-plat-hi)), color-mix(in srgb, var(--apex-accent, var(--apex-plat-mid)) 22%, transparent));
  box-shadow: 0 0 10px color-mix(in srgb, var(--apex-accent, transparent) 30%, transparent);
  transform-origin: bottom; animation: ws-grow 0.7s var(--apex-ease-editorial) both;
  transition: box-shadow 0.25s var(--apex-ease-editorial), filter 0.25s var(--apex-ease-editorial); }
@keyframes ws-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
/* Brillo reflectante en la PROPIA barra al pasar el ratón (no espejo abajo) */
.ws-ev-fill::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0;
  background: linear-gradient(115deg, transparent 36%, rgba(255, 255, 255, 0.7) 50%, transparent 64%);
  transform: translateX(-130%); transition: opacity 0.2s ease;
}
.ws-ev-col:hover .ws-ev-fill { box-shadow: 0 0 24px color-mix(in srgb, var(--apex-accent, transparent) 75%, transparent); filter: brightness(1.12); }
.ws-ev-col:hover .ws-ev-fill::after { opacity: 1; animation: ws-shine 1.3s ease-in-out infinite; }
@keyframes ws-shine { 0% { transform: translateX(-130%); } 60%, 100% { transform: translateX(130%); } }
.ws-ev-col:hover .ws-ev-val { color: var(--apex-accent, var(--apex-plat-hi)); }
.ws-ev-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--apex-plat-low); }

.apex-section.ws-readout { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.ws-ro { padding: 20px 22px; }
.ws-ro-list { display: flex; flex-direction: column; gap: 12px; }
.ws-ro-row { display: flex; gap: 10px; font-size: 12.5px; color: var(--apex-plat-mid); line-height: 1.45; animation: ws-reveal 0.45s var(--apex-ease-editorial) both; }
.ws-ro-ic { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex: 0 0 20px; border-radius: 50%; margin-top: 1px; }
.ws-ro[data-tone="pos"] .ws-ro-ic { background: var(--apex-accent, var(--apex-plat-hi)); color: var(--apex-accent-ink, var(--apex-bg)); }
.ws-ro[data-tone="neg"] .ws-ro-ic { background: color-mix(in srgb, var(--apex-status-neg) 20%, transparent); color: var(--apex-status-neg); }
.ws-ro[data-tone="plan"] .ws-ro-ic { border: 1px solid var(--apex-accent, var(--apex-border)); color: var(--apex-accent, var(--apex-plat-mid)); }
.ws-ro-an { margin-left: auto; font-size: 9px; letter-spacing: 0.08em; text-transform: none; color: var(--apex-accent, var(--apex-plat-mid)); animation: ws-blink 1.2s ease-in-out infinite; }
@keyframes ws-blink { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
@keyframes ws-reveal { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }

/* Borde neón animado */
@property --ws-ang { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
.ws-glow-border { position: relative; }
.ws-glow-border::after {
  content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px; pointer-events: none; z-index: 3;
  background: conic-gradient(from var(--ws-ang), transparent 0 60%, color-mix(in srgb, var(--apex-accent, var(--apex-plat-hi)) 90%, transparent) 78%, transparent 93%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  animation: ws-rotate 5s linear infinite;
}
@keyframes ws-rotate { to { --ws-ang: 360deg; } }

.ws-chat { display: grid; grid-template-columns: 250px 1fr; min-height: 440px; padding: 0; overflow: hidden; }
.ws-chat-list { display: flex; flex-direction: column; border-right: 1px solid var(--apex-alpha-3); min-height: 0; }
.ws-chat-new { display: inline-flex; align-items: center; gap: 8px; margin: 12px; padding: 9px 12px; background: var(--apex-accent, var(--apex-plat-hi)); color: var(--apex-accent-ink, var(--apex-bg)); border: 0; border-radius: var(--apex-radius-sm, 0); font-family: var(--apex-font); font-size: 12.5px; font-weight: 500; cursor: pointer; }
.ws-chat-threads { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
.ws-chat-item { display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 11px 14px; background: transparent; border: 0; border-bottom: 1px solid var(--apex-alpha-3); cursor: pointer; }
.ws-chat-item:hover { background: var(--apex-alpha-2); }
.ws-chat-item[data-active] { background: var(--apex-accent-soft, var(--apex-alpha-3)); box-shadow: inset 3px 0 0 var(--apex-accent, var(--apex-plat-mid)); }
.ws-chat-item-t { font-size: 12.5px; color: var(--apex-plat-hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ws-chat-item-n { font-size: 10.5px; color: var(--apex-plat-low); }
.ws-chat-main { display: flex; flex-direction: column; min-height: 0; }
.ws-chat-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.ws-chat-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; padding: 32px 16px; color: var(--apex-plat-low); }
.ws-chat-empty svg { color: var(--apex-accent, var(--apex-plat-mid)); }
.ws-chat-empty h4 { margin: 4px 0 0; font-weight: 400; font-size: 15px; color: var(--apex-plat-hi); }
.ws-chat-empty p { margin: 0; font-size: 12.5px; line-height: 1.5; max-width: 42ch; }
.ws-msg { display: flex; }
.ws-msg--user { justify-content: flex-end; }
.ws-bubble { max-width: 78%; padding: 10px 13px; border: 1px solid var(--apex-border); font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; border-radius: var(--apex-radius-sm, 0); }
.ws-msg--user .ws-bubble { background: var(--apex-accent, var(--apex-plat-hi)); color: var(--apex-accent-ink, var(--apex-bg)); border-color: var(--apex-accent, var(--apex-plat-hi)); }
.ws-msg--assistant .ws-bubble { background: var(--apex-trigger-bg); color: var(--apex-plat-hi); }
.ws-bubble--think { display: inline-flex; align-items: center; gap: 7px; color: var(--apex-plat-low); }
.ws-chat-form { display: flex; align-items: flex-end; gap: 8px; padding: 12px; border-top: 1px solid var(--apex-alpha-3); }
.ws-chat-input { flex: 1; resize: none; min-height: 38px; max-height: 120px; padding: 9px 11px; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); color: var(--apex-plat-hi); font-family: var(--apex-font); font-size: 12.5px; outline: none; border-radius: var(--apex-radius-sm, 0); }
.ws-chat-input:focus { border-color: var(--apex-border-strong); }
.ws-chat-send { width: 38px; height: 38px; flex: 0 0 38px; display: inline-flex; align-items: center; justify-content: center; background: var(--apex-accent, var(--apex-plat-hi)); color: var(--apex-accent-ink, var(--apex-bg)); border: 0; border-radius: var(--apex-radius-sm, 0); cursor: pointer; }
.ws-chat-send:disabled { opacity: 0.4; cursor: not-allowed; }

@media (max-width: 980px) {
  .apex-section.ws-main { grid-template-columns: 1fr; }
  .apex-section.ws-readout { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .ws-insights { grid-template-columns: 1fr; }
  .ws-stats { grid-template-columns: repeat(2, 1fr); }
  .ws-bn-head { flex-wrap: wrap; }
  .ws-bn-score { text-align: left; }
  .ws-bn-area { font-size: 21px; }
  /* Chat IA: en móvil pasa a columna (lista arriba, conversación abajo) con el
     cuerpo desplazable, para que el campo de escribir NO se corte abajo. */
  .ws-chat { display: flex; flex-direction: column; min-height: 0; }
  .ws-chat-list { border-right: 0; border-bottom: 1px solid var(--apex-alpha-3); }
  .ws-chat-threads { flex-direction: row; overflow-x: auto; }
  .ws-chat-item { min-width: 160px; border-bottom: 0; border-right: 1px solid var(--apex-alpha-3); }
  .ws-chat-main { flex: 1; min-height: 0; }
  .ws-chat-body { max-height: 50vh; }
  .ws-chat-input { font-size: 16px; }   /* evita el zoom de iOS al enfocar */
}
`
