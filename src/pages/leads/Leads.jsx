import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import FloatingHeader from '../../components/FloatingHeader'
import HoverMenu from '../../components/HoverMenu'
import { STAGES, SOURCES, TAGS, ASSIGNEES, MOCK_LEADS, SMART_VIEWS, leadMatches, SUMMARY_FIELDS, genLeadSummary } from '../../data/mock/leads'
import { CLIENTS, CLIENT_OPTIONS, clientName, CLIENT_CYCLE } from '../../data/mock/clients'
import { fmtDateTime } from '../../lib/format'
import { listLeads, saveLead, deleteLead as apiDeleteLead } from '../../lib/leadsApi'

/*
 * Leads (CRM) — recreación fiel del CRM de Apex en stack limpio: Kanban + Lista,
 * filtros, Smart Views, ficha clicable (datos editables + actividad + chat de
 * WhatsApp), iniciar guion desde el lead, link Zoom/Meet y ver calendario Google.
 */
const money = (v) => v == null || v === '' ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
const intf = (v) => new Intl.NumberFormat('es-ES').format(Math.round(v || 0))
const fmtDay = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) } catch { return '' } }
const stageLabel = (k) => STAGES.find(s => s.key === k)?.label || k
const ghost = { background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }
const SV_KEY = 'apex_closer_leadviews'
const readSV = () => { try { return JSON.parse(localStorage.getItem(SV_KEY)) || [] } catch { return [] } }
const writeSV = (v) => { try { localStorage.setItem(SV_KEY, JSON.stringify(v)) } catch { /* off */ } }

function FilterMenu({ label, value, display, options, onPick }) {
  return (
    <HoverMenu label={label} value={display || 'Todos'}>
      <HoverMenu.Item selected={!value} onSelect={() => onPick(null)}>Todos</HoverMenu.Item>
      {options.map(o => (
        <HoverMenu.Item key={o.key} selected={o.key === value} onSelect={() => onPick(o.key)}>{o.label}</HoverMenu.Item>
      ))}
    </HoverMenu>
  )
}

const isUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''))
const mapRow = (r) => ({ ...r, summary: r.summary || null, messages: r.messages || [] })

export default function Leads() {
  const navigate = useNavigate()
  const [leads, setLeads] = useState([])          // vacío hasta que responde el backend (no flashear mock)
  const [source, setSource] = useState('loading') // loading | live | mock
  const [view, setView] = useState('kanban')
  const [filters, setFilters] = useState({})
  const [activeView, setActiveView] = useState('all')
  const [savedViews, setSavedViews] = useState(readSV)
  const [openId, setOpenId] = useState(null)
  const [tab, setTab] = useState('datos')
  const [draft, setDraft] = useState('')
  const [dragId, setDragId] = useState(null)   // lead que se está arrastrando
  const [overCol, setOverCol] = useState(null) // columna resaltada al pasar por encima
  const saveTimers = useRef({})

  // Carga desde el backend (CRM persistido). Si no hay backend, cae a mock.
  useEffect(() => {
    let alive = true
    listLeads()
      .then(rows => { if (alive) { setLeads(rows.length ? rows.map(mapRow) : []); setSource('live') } })
      .catch(() => { if (alive) { setLeads(MOCK_LEADS); setSource('mock') } })
    return () => { alive = false }
  }, [])

  // Persiste un lead en el backend (debounce por id para no saturar al teclear).
  const persist = (lead) => {
    if (source !== 'live') return
    clearTimeout(saveTimers.current[lead.id])
    saveTimers.current[lead.id] = setTimeout(() => {
      saveLead(lead).then(saved => {
        if (saved && saved.id !== lead.id) {
          setLeads(ls => ls.map(l => l.id === lead.id ? { ...l, id: saved.id } : l))
          if (openId === lead.id) setOpenId(saved.id)
        }
      }).catch(() => { /* offline: el estado local ya está actualizado */ })
    }, 500)
  }

  const allViews = [...SMART_VIEWS, ...savedViews]
  const setF = (k, v) => { setFilters(f => { const n = { ...f }; if (v == null) delete n[k]; else n[k] = v; return n }); setActiveView(null) }
  const applyView = (v) => { setFilters({ ...v.filter }); setActiveView(v.id) }
  const clearFilters = () => { setFilters({}); setActiveView('all') }
  const saveView = () => {
    const name = window.prompt('Nombre de la vista')
    if (!name) return
    const v = { id: 'sv' + Date.now(), name, filter: { ...filters } }
    const next = [...savedViews, v]; setSavedViews(next); writeSV(next); setActiveView(v.id)
  }

  const filtered = leads.filter(l => leadMatches(l, filters))
  const byStage = STAGES.map(s => ({ ...s, items: filtered.filter(l => l.stage === s.key) }))
  const active = leads.find(l => l.id === openId)
  const hasFilters = Object.keys(filters).length > 0

  // Métricas del CRM (sobre el conjunto filtrado: respeta cliente/etapa/etc.).
  const open = filtered.filter(l => l.stage !== 'cerrado')
  const metrics = {
    total: filtered.length,
    pipeline: open.reduce((a, l) => a + (Number(l.value) || 0), 0),
    won: filtered.filter(l => l.stage === 'cerrado').length,
    hot: open.filter(l => (l.tags || []).includes('caliente')).length,
    stale: open.filter(l => l.last_at && (Date.now() - new Date(l.last_at).getTime()) > 7 * 86400000).length,
    due: open.filter(l => l.next_at && new Date(l.next_at).getTime() <= Date.now()).length,
  }
  const crmKpis = [
    { label: 'Leads', value: intf(metrics.total) },
    { label: 'Pipeline abierto', value: money(metrics.pipeline) },
    { label: 'Cerrados', value: intf(metrics.won) },
    { label: 'Calientes', value: intf(metrics.hot) },
    { label: 'Sin tocar +7d', value: intf(metrics.stale) },
    { label: 'Seguimientos vencidos', value: intf(metrics.due) },
  ]

  const updateLead = (id, patch) => setLeads(ls => ls.map(l => {
    if (l.id !== id) return l
    const next = { ...l, ...patch }
    persist(next)
    return next
  }))
  // Cambia un lead a una etapa concreta (lo usa el drag-and-drop) y lo persiste.
  const setStage = (id, stageKey) => setLeads(ls => ls.map(l => {
    if (l.id !== id || l.stage === stageKey) return l
    const next = { ...l, stage: stageKey }
    persist(next)
    return next
  }))
  // Drop de una tarjeta sobre una columna.
  const onDropCol = (stageKey) => { if (dragId) setStage(dragId, stageKey); setDragId(null); setOverCol(null) }
  const openLead = (id) => { setOpenId(id); setTab('datos') }
  const addLead = () => {
    const id = 'new' + Date.now()
    const lead = { id, name: 'Nuevo lead', company: '', email: '', phone: '', value: null, stage: 'nuevo', source: SOURCES[0], tags: [], assignee: ASSIGNEES[0], next_step: '', client_id: filters.client || CLIENT_CYCLE[0], last_at: new Date().toISOString(), messages: [] }
    setLeads(ls => [lead, ...ls]); openLead(id)
    if (source === 'live') {
      saveLead(lead).then(saved => {
        if (!saved) return
        setLeads(ls => ls.map(l => l.id === id ? mapRow(saved) : l)); setOpenId(saved.id)
      }).catch(() => { /* offline */ })
    }
  }
  const removeLead = (id) => {
    setLeads(ls => ls.filter(l => l.id !== id)); setOpenId(null)
    if (source === 'live' && isUuid(id)) apiDeleteLead(id).catch(() => { /* offline */ })
  }
  const sendWa = (lead) => {
    const text = draft.trim(); if (!text) return
    updateLead(lead.id, { messages: [...(lead.messages || []), { dir: 'out', body: text, ts: Date.now() }] })
    setDraft('')
  }

  const activeViewName = allViews.find(v => v.id === activeView)?.name || 'Personalizada'

  return (
    <>
      <FloatingHeader title="Leads (CRM)" eyebrow="CRM" actions={
        <div className="apex-filter-bar">
          <div className="seg">
            <button type="button" className="seg-btn" data-active={view === 'kanban' || undefined} onClick={() => setView('kanban')}>Kanban</button>
            <button type="button" className="seg-btn" data-active={view === 'lista' || undefined} onClick={() => setView('lista')}>Lista</button>
          </div>
          <HoverMenu label="Vista" value={activeViewName}>
            {allViews.map(v => <HoverMenu.Item key={v.id} selected={v.id === activeView} onSelect={() => applyView(v)}>{v.name}</HoverMenu.Item>)}
          </HoverMenu>
          <button className="ac-btn" style={ghost} onClick={() => navigate('/calendario')}>Calendario</button>
          <button className="ac-btn" onClick={addLead}>+ Lead</button>
        </div>
      } />

      <section className="apex-section">
        <div className="apex-card kpi-strip">
          {crmKpis.map(k => (
            <div className="kpi" key={k.label}>
              <span className="kpi-label">{k.label}</span>
              <span className="kpi-value">{k.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="apex-section">
        <div className="crm-filters">
          <input className="ac-input" style={{ maxWidth: 200 }} placeholder="Buscar lead…" value={filters.q || ''} onChange={e => setF('q', e.target.value || null)} />
          <FilterMenu label="Cliente" value={filters.client} display={filters.client && clientName(filters.client)} options={CLIENT_OPTIONS} onPick={v => setF('client', v)} />
          <FilterMenu label="Etapa" value={filters.stage} display={filters.stage && stageLabel(filters.stage)} options={STAGES} onPick={v => setF('stage', v)} />
          <FilterMenu label="Fuente" value={filters.source} display={filters.source} options={SOURCES.map(s => ({ key: s, label: s }))} onPick={v => setF('source', v)} />
          <FilterMenu label="Etiqueta" value={filters.tag} display={filters.tag} options={TAGS.map(t => ({ key: t, label: t }))} onPick={v => setF('tag', v)} />
          <FilterMenu label="Asignado" value={filters.assignee} display={filters.assignee} options={ASSIGNEES.map(a => ({ key: a, label: a }))} onPick={v => setF('assignee', v)} />
          <span className="crm-count">{filtered.length} leads</span>
          {hasFilters && <button className="crm-link" onClick={saveView}>Guardar vista</button>}
          {hasFilters && <button className="crm-link" onClick={clearFilters}>Limpiar</button>}
        </div>

        {view === 'kanban' ? (
          <div className="pl-board">
            {byStage.map(col => (
              <div className="pl-col" key={col.key} data-stage={col.key} data-focus={col.key === 'agendada' || undefined} data-over={overCol === col.key || undefined}
                onDragOver={e => { if (dragId) { e.preventDefault(); if (overCol !== col.key) setOverCol(col.key) } }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(c => c === col.key ? null : c) }}
                onDrop={e => { e.preventDefault(); onDropCol(col.key) }}>
                <div className="pl-col-head"><span>{col.label}</span><span className="pl-col-count">{col.items.length}</span></div>
                <div className="pl-col-body">
                  {col.items.map(l => {
                    const temp = (l.tags || []).includes('caliente') ? 'hot' : (l.tags || []).includes('templado') ? 'warm' : (l.tags || []).includes('frío') ? 'cold' : 'none'
                    return (
                    <div className="apex-card pl-card" key={l.id} draggable
                      data-dragging={dragId === l.id || undefined}
                      onDragStart={e => { setDragId(l.id); e.dataTransfer.effectAllowed = 'move' }}
                      onDragEnd={() => { setDragId(null); setOverCol(null) }}
                      onClick={() => { if (!dragId) openLead(l.id) }}>
                      <div className="pl-card-top"><span className="pl-name"><span className="pl-dot" data-temp={temp} />{l.name}</span><span className="pl-val">{money(l.value)}</span></div>
                      {l.company && <div className="pl-company">{l.company}</div>}
                      {(l.tags || []).length > 0 && <div className="lead-tags">{l.tags.map(t => <span className="lead-tag" key={t}>{t}</span>)}</div>}
                      {l.next_step && <div className="pl-next"><span className="pl-next-label">Seguimiento</span>{l.next_step}{l.next_at ? ` · ${fmtDay(l.next_at)}` : ''}</div>}
                    </div>
                    )
                  })}
                  {col.items.length === 0 && <div className="pl-col-empty">Suelta aquí</div>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="apex-card" style={{ padding: 0 }}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Lead</th><th>Cliente</th><th>Etapa</th><th>Fuente</th><th className="num">Valor</th><th>Asignado</th><th>Últ.</th></tr></thead>
                <tbody>
                  {filtered.map(l => (
                    <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => openLead(l.id)}>
                      <td className="tbl-strong">{l.name}<div style={{ fontSize: 11, color: 'var(--apex-plat-low)' }}>{l.company}</div></td>
                      <td>{clientName(l.client_id)}</td>
                      <td><span className="lead-stage">{stageLabel(l.stage)}</span></td>
                      <td>{l.source}</td>
                      <td className="num">{money(l.value)}</td>
                      <td>{l.assignee}</td>
                      <td>{fmtDay(l.last_at)}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--apex-plat-low)', padding: 24 }}>Sin leads con esos filtros.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {active && (
        <>
          <div className="dw-backdrop" onClick={() => setOpenId(null)} />
          <aside className="dw">
            <div className="dw-head">
              <div>
                <h2 className="dw-title">{active.name}</h2>
                <div style={{ fontSize: 12, color: 'var(--apex-plat-low)' }}>{active.company} · {clientName(active.client_id)}</div>
              </div>
              <button className="dw-close" onClick={() => setOpenId(null)} aria-label="Cerrar">✕</button>
            </div>

            <div className="crm-actions">
              <button className="ac-btn" onClick={() => navigate(`/scripts/live/${active.client_id}`)}>▶ Iniciar guion</button>
              <button className="ac-btn" style={ghost} onClick={() => navigate('/calendario')} title="Ver calendario de reservas">Calendario</button>
              {active.meeting_url
                ? <button className="ac-btn" style={ghost} onClick={() => window.open(active.meeting_url, '_blank')}>Reunión</button>
                : <button className="ac-btn" style={ghost} disabled title="Sin enlace de reunión">Reunión</button>}
              <button className="ac-btn" style={ghost} onClick={() => setTab('chat')}>WhatsApp</button>
              <button className="ac-btn" style={{ ...ghost, marginLeft: 'auto', color: 'var(--apex-plat-low)' }} onClick={() => { if (window.confirm(`¿Eliminar el lead "${active.name}"?`)) removeLead(active.id) }} title="Eliminar lead">Eliminar</button>
            </div>

            <div className="seg" style={{ margin: '4px 0 16px' }}>
              {[['datos', 'Datos'], ['actividad', 'Actividad'], ['chat', 'Chat'], ['resumen', 'Resumen']].map(([t, l]) => (
                <button key={t} className="seg-btn" data-active={tab === t || undefined} onClick={() => setTab(t)}>{l}</button>
              ))}
            </div>

            {tab === 'datos' && (
              <div className="crm-form">
                <label className="sc-lbl">Email</label>
                <input className="ac-input" value={active.email || ''} onChange={e => updateLead(active.id, { email: e.target.value })} />
                <label className="sc-lbl">Teléfono</label>
                <input className="ac-input" value={active.phone || ''} onChange={e => updateLead(active.id, { phone: e.target.value })} />
                <label className="sc-lbl">Valor (€)</label>
                <input className="ac-input" type="number" value={active.value ?? ''} onChange={e => updateLead(active.id, { value: e.target.value === '' ? null : Number(e.target.value) })} />
                <label className="sc-lbl">Etapa</label>
                <select className="ac-input" value={active.stage} onChange={e => updateLead(active.id, { stage: e.target.value })}>
                  {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <label className="sc-lbl">Fuente</label>
                <select className="ac-input" value={active.source || ''} onChange={e => updateLead(active.id, { source: e.target.value })}>
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <label className="sc-lbl">Asignado</label>
                <select className="ac-input" value={active.assignee || ''} onChange={e => updateLead(active.id, { assignee: e.target.value })}>
                  {ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <label className="sc-lbl">Etiquetas</label>
                <div className="lead-tags">
                  {TAGS.map(t => {
                    const on = (active.tags || []).includes(t)
                    return <button key={t} type="button" className="lead-tag" data-on={on || undefined}
                      onClick={() => updateLead(active.id, { tags: on ? active.tags.filter(x => x !== t) : [...(active.tags || []), t] })}>{t}</button>
                  })}
                </div>
                <label className="sc-lbl">Próximo paso</label>
                <input className="ac-input" value={active.next_step || ''} onChange={e => updateLead(active.id, { next_step: e.target.value })} />
              </div>
            )}

            {tab === 'actividad' && (
              <div className="home-list">
                <div className="dw-row"><span className="dw-k">Etapa</span><span className="dw-v">{stageLabel(active.stage)}</span></div>
                <div className="dw-row"><span className="dw-k">Último contacto</span><span className="dw-v">{fmtDateTime(active.last_at)}</span></div>
                <div className="dw-row"><span className="dw-k">Próximo paso</span><span className="dw-v">{active.next_step || '—'}</span></div>
                <div className="dw-row"><span className="dw-k">Reunión</span><span className="dw-v">{active.meeting_url ? 'Programada' : '—'}</span></div>
              </div>
            )}

            {tab === 'chat' && (
              <div className="wa">
                <div className="wa-banner">
                  WhatsApp no conectado · <button className="crm-link" onClick={() => alert('Conexión por QR disponible al desplegar el worker de WhatsApp.')}>Conectar (QR)</button>
                  {active.phone && <a className="crm-link" href={`https://wa.me/${active.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">Abrir en WhatsApp</a>}
                </div>
                <div className="wa-body">
                  {(active.messages || []).length === 0 && <p className="ac-empty" style={{ padding: '8px 0' }}>Aún no hay mensajes con {active.name}.</p>}
                  {(active.messages || []).map((m, i) => (
                    <div key={i} className={`apex-orb-msg apex-orb-msg--${m.dir === 'out' ? 'user' : 'assistant'}`}><div className="apex-orb-msg-bubble">{m.body}</div></div>
                  ))}
                </div>
                <form className="apex-orb-form" onSubmit={e => { e.preventDefault(); sendWa(active) }}>
                  <textarea className="apex-orb-input" rows={1} placeholder="Escribe un mensaje…" value={draft} onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendWa(active) } }} />
                  <button className="apex-orb-send" type="submit" aria-label="Enviar">→</button>
                </form>
              </div>
            )}

            {tab === 'resumen' && (
              <div className="lsum">
                {active.summary ? (
                  <>
                    {SUMMARY_FIELDS.map(f => active.summary[f.key] && (
                      <div className="lsum-item" key={f.key}>
                        <div className="lsum-label">{f.label}</div>
                        <div className="lsum-text">{active.summary[f.key]}</div>
                      </div>
                    ))}
                    <button className="ac-btn" style={ghost} onClick={() => updateLead(active.id, { summary: genLeadSummary(active) })}>Regenerar</button>
                  </>
                ) : (
                  <div className="ac-empty" style={{ padding: 0 }}>
                    <p style={{ margin: '0 0 12px' }}>El resumen se genera con IA al terminar la llamada: objetivos, bloqueos, compromiso, cualificación, financiera, prioridad y decisión.</p>
                    <button className="ac-btn" onClick={() => updateLead(active.id, { summary: genLeadSummary(active) })}>Generar resumen</button>
                  </div>
                )}
              </div>
            )}
          </aside>
        </>
      )}
    </>
  )
}
