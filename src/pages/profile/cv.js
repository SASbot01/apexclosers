// Currículum del closer — abre una ventana con el CV maquetado, lista para
// imprimir/guardar como PDF o descargar como HTML autocontenido.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function cvHtml(cv) {
  const highlights = (cv.highlights || []).map(h => `<div class="kpi"><div class="kpi-v">${esc(h.value)}</div><div class="kpi-l">${esc(h.label)}</div></div>`).join('')
  const links = (cv.links || []).map(l => `<a href="${esc(l.url)}">${esc(l.label || l.url)}</a>`).join(' · ')
  const avatar = cv.photo_url ? `<img class="avatar" src="${esc(cv.photo_url)}" alt="">` : `<div class="avatar avatar--ph">${esc((cv.name || '?').slice(0, 1))}</div>`
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>CV · ${esc(cv.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0c0e14; color: #1a1d24; }
  .toolbar { position: sticky; top: 0; display: flex; gap: 8px; justify-content: flex-end; padding: 12px 16px; background: #0c0e14; }
  .toolbar button { font: inherit; font-size: 13px; padding: 8px 14px; border: 1px solid #444; background: #1a1d24; color: #eaeaea; cursor: pointer; border-radius: 4px; }
  .toolbar button:hover { background: #262a33; }
  .page { max-width: 820px; margin: 0 auto 40px; background: #fff; padding: 48px 56px; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
  .head { display: flex; gap: 22px; align-items: center; border-bottom: 2px solid #111; padding-bottom: 22px; }
  .avatar { width: 92px; height: 92px; border-radius: 50%; object-fit: cover; flex: 0 0 92px; }
  .avatar--ph { background: #111; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 38px; }
  h1 { margin: 0 0 4px; font-size: 28px; letter-spacing: -0.01em; }
  .nick { color: #666; font-size: 14px; }
  .headline { font-size: 15px; color: #333; margin-top: 6px; }
  .loc { font-size: 13px; color: #777; margin-top: 2px; }
  .sec { margin-top: 28px; }
  .sec h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #999; margin: 0 0 12px; }
  .summary { font-size: 14.5px; line-height: 1.6; color: #222; }
  .bio { font-size: 14px; line-height: 1.6; color: #333; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 14px; }
  .kpi { border: 1px solid #e3e3e3; padding: 14px; border-radius: 6px; }
  .kpi-v { font-size: 22px; font-weight: 600; }
  .kpi-l { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin-top: 4px; }
  .links a { color: #1a4fd0; text-decoration: none; font-size: 13px; }
  .foot { margin-top: 32px; font-size: 11px; color: #aaa; }
  @media print { .toolbar { display: none; } body { background: #fff; } .page { box-shadow: none; margin: 0; max-width: none; } }
</style></head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Imprimir / Guardar PDF</button>
    <button id="dl">Descargar HTML</button>
  </div>
  <div class="page">
    <div class="head">
      ${avatar}
      <div>
        <h1>${esc(cv.name)}</h1>
        ${cv.nickname ? `<div class="nick">@${esc(cv.nickname)}</div>` : ''}
        ${cv.headline ? `<div class="headline">${esc(cv.headline)}</div>` : ''}
        ${cv.location ? `<div class="loc">${esc(cv.location)}</div>` : ''}
      </div>
    </div>
    ${cv.summary ? `<div class="sec"><h2>Resumen</h2><div class="summary">${esc(cv.summary)}</div></div>` : ''}
    ${cv.bio && cv.bio !== cv.summary ? `<div class="sec"><h2>Sobre mí</h2><div class="bio">${esc(cv.bio)}</div></div>` : ''}
    ${highlights ? `<div class="sec"><h2>Resultados</h2><div class="kpis">${highlights}</div></div>` : ''}
    ${links ? `<div class="sec"><h2>Enlaces</h2><div class="links">${links}</div></div>` : ''}
    <div class="foot">Generado por APEX · ${new Date(cv.generated_at || Date.now()).toLocaleDateString('es-ES')}</div>
  </div>
</body></html>`
}

export function openCV(cv) {
  const html = cvHtml(cv)
  const w = window.open('', '_blank')
  if (!w) { alert('Permite las ventanas emergentes para ver el CV.'); return }
  w.document.write(html)
  w.document.close()
  // Botón de descarga del HTML autocontenido.
  const wire = () => {
    const btn = w.document.getElementById('dl')
    if (!btn) return
    btn.onclick = () => {
      const blob = new Blob([html], { type: 'text/html' })
      const a = w.document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `CV-${(cv.nickname || cv.name || 'closer').replace(/\s+/g, '-')}.html`
      a.click()
    }
  }
  setTimeout(wire, 200)
}
