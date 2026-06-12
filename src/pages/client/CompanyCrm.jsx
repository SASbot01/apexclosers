// CRM de EMPRESA — leads de los closers de los equipos de la empresa, agrupados
// POR CLOSER y, dentro de cada closer, POR PROYECTO. Así la empresa ve de un
// vistazo qué leads tiene cada closer en cada proyecto. Filtros por closer,
// proyecto, etapa y búsqueda. Solo lectura.
import { useState, useEffect, useMemo } from 'react'
import { getCompanyCrm } from '../../lib/googleApi'

const money = (v) => v == null || v === '' ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(v) || 0)
const fmtDate = (d) => d ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(new Date(d)) : '—'
const initials = (n) => (n || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()
const STAGE_LABEL = { agendada: 'Agendada', nuevo: 'Nuevo', contactado: 'Contactado', seguimiento: 'Seguimiento', propuesta: 'Propuesta', cerrado: 'Cerrado', cerrada: 'Cerrada', perdido: 'Perdido' }
const SIN_PROYECTO = '__none__'

export default function CompanyCrm() {
  const [data, setData] = useState({ leads: [], closers: [], projects: [] })
  const [state, setState] = useState('loading')   // loading | ok | error
  const [closer, setCloser] = useState('all')
  const [project, setProject] = useState('all')
  const [stage, setStage] = useState('all')
  const [q, setQ] = useState('')

  useEffect(() => {
    getCompanyCrm().then(d => { setData(d); setState('ok') }).catch(() => setState('error'))
  }, [])

  const stages = useMemo(() => [...new Set(data.leads.map(l => l.stage).filter(Boolean))], [data.leads])
  const projName = (key) => data.projects.find(p => p.key === key)?.name || key

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return data.leads.filter(l =>
      (closer === 'all' || l.closer_id === closer) &&
      (project === 'all' || (project === SIN_PROYECTO ? !l.project : l.project === project)) &&
      (stage === 'all' || l.stage === stage) &&
      (!t || `${l.name || ''} ${l.email || ''} ${l.company || ''}`.toLowerCase().includes(t))
    )
  }, [data.leads, closer, project, stage, q])

  const totalValue = filtered.reduce((a, l) => a + (Number(l.value) || 0), 0)

  // Agrupado: closer → proyecto → leads. Solo closers con leads tras el filtro.
  const grouped = useMemo(() => {
    const byCloser = new Map()
    for (const l of filtered) {
      if (!byCloser.has(l.closer_id)) byCloser.set(l.closer_id, [])
      byCloser.get(l.closer_id).push(l)
    }
    return data.closers
      .filter(c => byCloser.has(c.id))
      .map(c => {
        const leads = byCloser.get(c.id)
        const projMap = new Map()
        for (const l of leads) {
          const key = l.project || SIN_PROYECTO
          if (!projMap.has(key)) projMap.set(key, [])
          projMap.get(key).push(l)
        }
        const projectsOfCloser = [...projMap.entries()].map(([key, ls]) => ({
          key, name: key === SIN_PROYECTO ? 'Sin proyecto' : projName(key),
          leads: ls, value: ls.reduce((a, x) => a + (Number(x.value) || 0), 0),
        }))
        return { closer: c, leads, projects: projectsOfCloser, value: leads.reduce((a, x) => a + (Number(x.value) || 0), 0) }
      })
  }, [filtered, data.closers, data.projects])

  return (
    <section className="apex-section">
      <div className="apex-card" style={{ padding: 20 }}>
        <div className="cr-head">
          <div>
            <h3 style={{ margin: '0 0 2px', fontWeight: 400 }}>CRM · pipeline de tu equipo</h3>
            <p className="set-note" style={{ margin: 0 }}>Leads de cada closer, agrupados por proyecto. Filtra por closer y por proyecto.</p>
          </div>
          <div className="cr-kpis">
            <span><b>{filtered.length}</b> leads</span>
            <span><b>{money(totalValue)}</b> pipeline</span>
          </div>
        </div>

        {state === 'error' && <p style={{ color: 'var(--apex-plat-mid)' }}>No pude cargar el CRM (¿backend?).</p>}
        {state === 'ok' && (
          <>
            <div className="cr-filters">
              <select value={closer} onChange={e => setCloser(e.target.value)}>
                <option value="all">Todos los closers</option>
                {data.closers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={project} onChange={e => setProject(e.target.value)}>
                <option value="all">Todos los proyectos</option>
                {data.projects.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                <option value={SIN_PROYECTO}>Sin proyecto</option>
              </select>
              <select value={stage} onChange={e => setStage(e.target.value)}>
                <option value="all">Todas las etapas</option>
                {stages.map(s => <option key={s} value={s}>{STAGE_LABEL[s] || s}</option>)}
              </select>
              <input placeholder="Buscar nombre, email…" value={q} onChange={e => setQ(e.target.value)} />
            </div>

            {grouped.length === 0
              ? <p className="ac-empty" style={{ padding: '18px 0' }}>No hay leads con estos filtros.</p>
              : <div className="cr-closers">
                  {grouped.map(g => (
                    <div className="cr-closer-block" key={g.closer.id}>
                      <div className="cr-closer-hd">
                        <span className="cr-av">{g.closer.photo_url ? <img src={g.closer.photo_url} alt="" /> : <span>{initials(g.closer.name)}</span>}</span>
                        <span className="cr-closer-name">{g.closer.name}</span>
                        <span className="cr-closer-chips">
                          {g.closer.projects.map(k => <span className="cr-chip" key={k}>{projName(k)}</span>)}
                        </span>
                        <span className="cr-closer-meta">{g.leads.length} leads · {money(g.value)}</span>
                      </div>

                      {g.projects.map(p => (
                        <div className="cr-proj" key={p.key}>
                          <div className="cr-proj-hd"><span className="cr-proj-name">{p.name}</span><span className="cr-proj-meta">{p.leads.length} · {money(p.value)}</span></div>
                          <div className="cr-table">
                            {p.leads.map(l => (
                              <div className="cr-row" key={l.id}>
                                <span className="cr-lead"><b>{l.name || 'Lead'}</b><small>{l.email || l.phone || l.source || ''}</small></span>
                                <span><span className="cr-stage">{STAGE_LABEL[l.stage] || l.stage || '—'}</span></span>
                                <span className="cr-val">{money(l.value)}</span>
                                <span className="cr-dim">{fmtDate(l.next_at || l.last_at)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>}
          </>
        )}
      </div>

      <style>{`
        .cr-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
        .cr-kpis { display: inline-flex; gap: 16px; font-size: 13px; color: var(--apex-plat-mid); }
        .cr-kpis b { color: var(--apex-plat-hi); font-size: 15px; }
        .cr-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
        .cr-filters select, .cr-filters input { background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); border-radius: 9px; padding: 8px 10px; color: var(--apex-plat-hi); font-size: 13px; font-family: inherit; }
        .cr-filters input { flex: 1; min-width: 140px; }

        .cr-closers { display: flex; flex-direction: column; gap: 18px; }
        .cr-closer-block { border: 1px solid var(--apex-border); border-radius: 12px; overflow: hidden; }
        .cr-closer-hd { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: var(--apex-trigger-bg); flex-wrap: wrap; }
        .cr-av { width: 30px; height: 30px; border-radius: 50%; overflow: hidden; background: var(--apex-card-bg); border: 1px solid var(--apex-border); display: inline-flex; align-items: center; justify-content: center; color: var(--apex-plat-mid); font-size: 11px; flex-shrink: 0; }
        .cr-av img { width: 100%; height: 100%; object-fit: cover; }
        .cr-closer-name { font-size: 14px; color: var(--apex-plat-hi); font-weight: 500; }
        .cr-closer-chips { display: inline-flex; gap: 6px; flex-wrap: wrap; }
        .cr-chip { font-size: 10.5px; color: var(--apex-plat-mid); border: 1px solid var(--apex-border); border-radius: 20px; padding: 2px 9px; }
        .cr-closer-meta { margin-left: auto; font-size: 12px; color: var(--apex-plat-low); }

        .cr-proj { padding: 4px 14px 10px; }
        .cr-proj-hd { display: flex; justify-content: space-between; align-items: baseline; padding: 10px 2px 6px; }
        .cr-proj-name { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--apex-plat-low); }
        .cr-proj-meta { font-size: 11.5px; color: var(--apex-plat-low); }
        .cr-table { display: flex; flex-direction: column; }
        .cr-row { display: grid; grid-template-columns: 1fr auto 90px 64px; align-items: center; gap: 10px; padding: 9px 2px; border-top: 1px solid var(--apex-border); font-size: 13px; color: var(--apex-plat-hi); }
        .cr-lead { display: flex; flex-direction: column; min-width: 0; }
        .cr-lead small { color: var(--apex-plat-low); font-size: 11.5px; }
        .cr-stage { font-size: 11.5px; border: 1px solid var(--apex-border); border-radius: 6px; padding: 2px 7px; color: var(--apex-plat-mid); }
        .cr-val { text-align: right; }
        .cr-dim { color: var(--apex-plat-low); text-align: right; }
        @media (max-width: 560px) { .cr-row { grid-template-columns: 1fr auto 64px; } .cr-val { display: none; } }
      `}</style>
    </section>
  )
}
