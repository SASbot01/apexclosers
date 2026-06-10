import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Stack replicado de Apex Operations: Vite 7 + React 19 + alias '@' → src.
// (Tauri se puede añadir más adelante; ver docs/DEVELOPMENT.md.)
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5180, strictPort: true, host: true,
    allowedHosts: true,   // permite el Host del túnel cloudflare (*.trycloudflare.com)
    // Backend local (server/local-api.mjs) ejecuta las rutas api/*. Sin este
    // proxy, vite serviría el CÓDIGO FUENTE de api/auth.js en vez de ejecutarlo.
    proxy: { '/api': 'http://127.0.0.1:5181' },
  },
  // PRODUCCIÓN: `vite preview` sirve el build (dist) — un solo bundle, sin HMR ni
  // carga de módulos sueltos. Es lo que se expone por el túnel a usuarios reales:
  // el dev server carga decenas de módulos por petición y sobre un túnel inestable
  // (móvil) fallaba con "Failed to fetch". Mismo puerto, proxy y allowedHosts.
  preview: {
    port: 5180, strictPort: true, host: true,
    allowedHosts: true,
    proxy: { '/api': 'http://127.0.0.1:5181' },
  },
  build: { target: 'esnext' },
})
