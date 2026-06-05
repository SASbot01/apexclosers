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
  server: { port: 5173, strictPort: true, host: true },
  build: { target: 'esnext' },
})
