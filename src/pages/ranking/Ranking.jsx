import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FloatingHeader from '../../components/FloatingHeader'
import AvailabilityDot from '../../components/AvailabilityDot'
import { getRanking } from '../../lib/workflowApi'

/*
 * Ranking Global — clasificación de closers por ventas VERIFICADAS (revenue).
 * Cada closer se muestra con su perfil público; clicas para verlo.
 */
const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const initials = (name) => (name || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()
const medal = (r) => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `${r}`

export default function Ranking() {
  const [data, setData] = useState({ ranking: [], me: null })
  const [state, setState] = useState('loading')
  const [scope, setScope] = useState('global')
  const navigate = useNavigate()

  useEffect(() => {
    setState('loading')
    getRanking(scope).then(d => { setData(d); setState('live') }).catch(() => setState('error'))
  }, [scope])

  return (
    <>
      <FloatingHeader title="Ranking" eyebrow="CLOSERS" actions={
        <div className="seg">
          <button className="seg-btn" data-active={scope === 'global' || undefined} onClick={() => setScope('global')}>Global</button>
          <button className="seg-btn" data-active={scope === 'friends' || undefined} onClick={() => setScope('friends')}>Amigos</button>
        </div>
      } />
      <section className="apex-section">
        <p className="set-note" style={{ margin: 0 }}>{scope === 'friends' ? 'Tú y tus amigos, por revenue verificado.' : 'Todos los closers, por revenue de ventas verificadas.'} Sube ventas y verifícalas para escalar.</p>
        {state === 'error' && <div className="apex-card" style={{ padding: 16, color: 'var(--apex-plat-mid)' }}>No pude cargar el ranking (¿backend?).</div>}
        {state === 'live' && data.me && (
          <div className="apex-card" style={{ padding: 14, borderColor: 'color-mix(in srgb, #8AC8E0 45%, var(--apex-border))' }}>
            Tu posición: <b>#{data.me.rank}</b> · {money(data.me.revenue)} · {data.me.deals} cierres
          </div>
        )}
      </section>

      <section className="apex-section">
        {state === 'live' && data.ranking.length === 0 && <div className="apex-card" style={{ padding: 18, color: 'var(--apex-plat-low)' }}>Aún no hay ventas verificadas en el ranking.</div>}
        <div className="rk-list">
          {data.ranking.map(r => (
            <button key={r.user_id} type="button" className="apex-card rk-row" data-top={r.rank <= 3 || undefined} onClick={() => navigate(`/perfil/${r.user_id}`)}>
              <span className="rk-pos">{medal(r.rank)}</span>
              <span className="rk-av">{r.photo_url ? <img src={r.photo_url} alt="" /> : <span>{initials(r.name)}</span>}</span>
              <span className="rk-id"><span className="rk-name">{r.name}</span>{r.nickname && <span className="rk-nick">@{r.nickname}</span>}<span style={{ marginTop: 2 }}><AvailabilityDot status={r.status} /></span></span>
              <span className="rk-deals">{r.deals} cierres</span>
              <span className="rk-rev">{money(r.revenue)}</span>
            </button>
          ))}
        </div>
      </section>

      <style>{`
        .rk-list { display: flex; flex-direction: column; gap: 8px; }
        .rk-row { display: grid; grid-template-columns: 44px 40px 1fr auto auto; align-items: center; gap: 12px; padding: 12px 16px; text-align: left; cursor: pointer; background: var(--apex-card-bg, rgba(255,255,255,0.02)); }
        .rk-row:hover { border-color: var(--apex-plat-mid); }
        .rk-row[data-top] { border-color: color-mix(in srgb, #F4D35E 40%, var(--apex-border)); }
        .rk-pos { font-size: 18px; text-align: center; color: var(--apex-plat-hi); }
        .rk-av { width: 36px; height: 36px; border-radius: 50%; overflow: hidden; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); display: inline-flex; align-items: center; justify-content: center; color: var(--apex-plat-mid); font-size: 12px; }
        .rk-av img { width: 100%; height: 100%; object-fit: cover; }
        .rk-id { display: flex; flex-direction: column; min-width: 0; }
        .rk-name { font-size: 13.5px; color: var(--apex-plat-hi); }
        .rk-nick { font-size: 11px; color: var(--apex-plat-low); }
        .rk-deals { font-size: 12px; color: var(--apex-plat-low); }
        .rk-rev { font-size: 14px; color: var(--apex-plat-hi); font-family: var(--apex-font); }
        @media (max-width: 430px) {
          .rk-row { grid-template-columns: 30px 34px 1fr auto; gap: 8px; padding: 11px 12px; }
          .rk-deals { display: none; }
        }
      `}</style>
    </>
  )
}
