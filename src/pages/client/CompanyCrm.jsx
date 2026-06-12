// CRM de EMPRESA — todos los leads de los closers que la empresa tiene en sus
// equipos, filtrables por closer y por proyecto. Solo lectura: la empresa ve el
// pipeline de su gente sin tocarlo.
import { useState, useEffect, useMemo } from 'react'
import { getCompanyCrm } from '../../lib/googleApi'

const money = (v) => v == null || v === '' ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(v) || 0)
const fmtDate = (d) => d ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(new Date(d)) : '—'
const STAGE_LABEL = { agendada: 'Agendada', nuevo: 'Nuevo', contactado: 'Contactado', seguimiento: 'Seguimiento', propuesta: 'Propuesta', cerrado: 'Cerrado', cerrada: 'Cerrada', perdido: 'Perdido' }

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

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return data.leads.filter(l =>
      (closer === 'all' || l.closer_id === closer) &&
      (project === 'all' || (project === 'none' ? !l.project : l.project === project)) &&
      (stage === 'all' || l.stage === stage) &&
      (!t || `${l.name || ''} ${l.email || ''} ${l.company || ''}`.toLowerCase().includes(t))
    )
  }, [data.leads, closer, project, stage, q])

  const totalValue = filtered.reduce((a, l) => a + (Number(l.value) || 0), 0)

  return (
    <section className="apex-section">
      <div className="apex-card" style={{ padding: 20 }}>
        <div className="cr-head">
          <div>
            <h3 style={{ margin: '0 0 2px', fontWeight: 400 }}>CRM · pipeline de tu equipo</h3>
            <p className="set-note" style={{ margin: 0 }}>Leads de los closers que trabajan tus proyectos. Filtra por closer y por proyecto.</p>
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
                <option value="none">Sin proyecto</option>
              </select>
              <select value={stage} onChange={e => setStage(e.target.value)}>
                <option value="all">Todas las etapas</option>
                {stages.map(s => <option key={s} value={s}>{STAGE_LABEL[s] || s}</option>)}
              </select>
              <input placeholder="Buscar nombre, email…" value={q} onChange={e => setQ(e.target.value)} />
            </div>

            {filtered.length === 0
              ? <p className="ac-empty" style={{ padding: '18px 0' }}>No hay leads con estos filtros.</p>
              : <div className="cr-table">
                  <div className="cr-row cr-row--h">
                    <span>Lead</span><span>Closer</span><span>Proyecto</span><span>Etapa</span><span>Valor</span><span>Próximo</span>
                  </div>
                  {filtered.map(l => (
                    <div className="cr-row" key={l.id}>
                      <span className="cr-lead"><b>{l.name || 'Lead'}</b><small>{l.email || l.phone || ''}</small></span>
                      <span className="cr-closer">{l.closer_photo ? <img src={l.closer_photo} alt="" /> : null}{l.closer_name}</span>
                      <span>{l.project_name || <em className="cr-dim">—</em>}</span>
                      <span><span className="cr-stage">{STAGE_LABEL[l.stage] || l.stage || '—'}</span></span>
                      <span>{money(l.value)}</span>
                      <span className="cr-dim">{fmtDate(l.next_at)}</span>
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
        .cr-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
        .cr-filters select, .cr-filters input { background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); border-radius: 9px; padding: 8px 10px; color: var(--apex-plat-hi); font-size: 13px; font-family: inherit; }
        .cr-filters input { flex: 1; min-width: 140px; }
        .cr-table { display: flex; flex-direction: column; }
        .cr-row { display: grid; grid-template-columns: 1.6fr 1.2fr 1.2fr 0.9fr 0.8fr 0.7fr; align-items: center; gap: 10px; padding: 10px 8px; border-bottom: 1px solid var(--apex-border); font-size: 13px; color: var(--apex-plat-hi); }
        .cr-row--h { font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--apex-plat-low); border-bottom-color: var(--apex-border); }
        .cr-lead { display: flex; flex-direction: column; }
        .cr-lead small { color: var(--apex-plat-low); font-size: 11.5px; }
        .cr-closer { display: inline-flex; align-items: center; gap: 7px; }
        .cr-closer img { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; }
        .cr-stage { font-size: 11.5px; border: 1px solid var(--apex-border); border-radius: 6px; padding: 2px 7px; color: var(--apex-plat-mid); }
        .cr-dim { color: var(--apex-plat-low); }
        @media (max-width: 640px) { .cr-row { grid-template-columns: 1.4fr 1fr 0.8fr; } .cr-row span:nth-child(3), .cr-row span:nth-child(5), .cr-row span:nth-child(6) { display: none; } }
      `}</style>
    </section>
  )
}
