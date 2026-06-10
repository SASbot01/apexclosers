import { useState } from 'react'
import { useApexTheme } from '../../shell/ThemeContext'
import AtmosphericCanvas from '../../shell/AtmosphericCanvas'
import { signInWithGoogle, signInDemo, signInClient } from '../../lib/auth'

/*
 * Landing pública — puerta de entrada. Cualquiera entra con Google (o modo demo
 * en local). Marca = logo Apex, sin nombre de producto.
 */
export default function Landing() {
  const { theme } = useApexTheme()
  const [clientMode, setClientMode] = useState(false)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const doClientLogin = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true)
    try { await signInClient(email.trim(), pw) }
    catch { setErr('Email o contraseña incorrectos.'); setBusy(false) }
  }
  return (
    <div className="apex-ops lp" data-theme={theme}>
      <AtmosphericCanvas />
      <div className="lp-wrap">
        <img className="lp-logo" src="/apex-mark-platinum.svg" alt="Apex" width={56} height={56} />

        <h1 className="lp-title">El sistema operativo del closer</h1>
        <p className="lp-sub">
          Graba y transcribe tus llamadas de venta, no pierdas un seguimiento y recibe
          feedback para cerrar más. Tu día, en piloto.
        </p>

        <div className="lp-cta">
          {!clientMode ? (
            <>
              <button className="lp-google" onClick={signInWithGoogle}>
                <GoogleIcon />
                Entrar con Google
              </button>
              <button className="lp-demo" onClick={signInDemo}>Entrar en modo demo</button>
              <button className="lp-link" onClick={() => setClientMode(true)}>¿Eres una empresa? Acceso clientes →</button>
            </>
          ) : (
            <form className="lp-form" onSubmit={doClientLogin}>
              <div className="lp-form-h">Acceso clientes</div>
              <input className="lp-input" type="email" placeholder="Email de tu cuenta" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" />
              <input className="lp-input" type="password" placeholder="Contraseña" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" />
              {err && <div className="lp-err">{err}</div>}
              <button className="lp-google" type="submit" disabled={busy || !email || !pw}>{busy ? 'Entrando…' : 'Entrar'}</button>
              <button className="lp-link" type="button" onClick={() => { setClientMode(false); setErr(null) }}>← Soy closer</button>
            </form>
          )}
        </div>

        <ul className="lp-points">
          <li>Notetaker que entra a tus calls, graba y transcribe</li>
          <li>Resumen + feedback automáticos de cada llamada</li>
          <li>Pipeline, seguimientos y métricas en un sitio</li>
        </ul>

        <p className="lp-foot">Acceso para closers · habla hispana</p>
      </div>

      <style>{LP_CSS}</style>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.4l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.6l6.3 5.2C41.9 35.3 44 30.1 44 24c0-1.3-.1-2.3-.4-3.5z"/>
    </svg>
  )
}

const LP_CSS = `
.lp { min-height: 100vh; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
.lp-wrap {
  position: relative; z-index: 10;
  display: flex; flex-direction: column; align-items: center; text-align: center;
  max-width: 560px; padding: 40px 24px;
}
.lp-logo { margin-bottom: 26px; filter: drop-shadow(0 8px 24px rgba(0,0,0,0.5)); }
.lp-title {
  font-family: var(--apex-font); font-weight: 400; font-size: 38px; line-height: 1.08;
  letter-spacing: -0.02em; color: var(--apex-plat-hi); margin: 0 0 14px;
}
.lp-sub { font-family: var(--apex-font); font-size: 15px; line-height: 1.6; color: var(--apex-plat-mid); margin: 0 0 30px; max-width: 460px; }
.lp-cta { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 320px; }
.lp-google {
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  padding: 13px 18px; cursor: pointer;
  background: var(--apex-plat-hi); color: #0a0c12; border: 1px solid var(--apex-plat-hi);
  font-family: var(--apex-font); font-size: 14px; font-weight: 500;
  transition: background 0.18s, transform 0.18s;
}
.lp-google:hover { background: #fff; transform: translateY(-1px); }
.lp-demo {
  padding: 11px 18px; cursor: pointer; background: transparent;
  border: 1px solid var(--apex-border); color: var(--apex-plat-mid);
  font-family: var(--apex-font); font-size: 13px; transition: border-color 0.18s, color 0.18s;
}
.lp-demo:hover { border-color: var(--apex-plat-mid); color: var(--apex-plat-hi); }
.lp-link { background: transparent; border: 0; color: var(--apex-plat-low); font-family: var(--apex-font); font-size: 12.5px; cursor: pointer; padding: 6px; margin-top: 2px; }
.lp-link:hover { color: var(--apex-plat-hi); }
.lp-form { display: flex; flex-direction: column; gap: 10px; width: 100%; text-align: left; }
.lp-form-h { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--apex-plat-low); text-align: center; margin-bottom: 2px; }
.lp-input { padding: 12px 14px; background: rgba(255,255,255,0.04); border: 1px solid var(--apex-border); color: var(--apex-plat-hi); font-family: var(--apex-font); font-size: 15px; outline: none; }
.lp-input:focus { border-color: var(--apex-plat-mid); }
.lp-err { font-size: 12.5px; color: #E58371; text-align: center; }
.lp-points { list-style: none; margin: 34px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.lp-points li { font-family: var(--apex-font); font-size: 13px; color: var(--apex-plat-low); position: relative; padding-left: 18px; }
.lp-points li::before { content: ''; position: absolute; left: 0; top: 7px; width: 5px; height: 5px; background: var(--apex-plat-mid); }
.lp-foot { margin-top: 36px; font-family: var(--apex-font); font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--apex-plat-shad); }
@media (max-width: 560px) { .lp-title { font-size: 30px; } }
`
