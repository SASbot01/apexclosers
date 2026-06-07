<div align="center">
  <img src="src/assets/apex-mark-platinum.svg" width="64" alt="Apex" />
</div>

# (software sin nombre — marca: logo Apex)

Software vertical para **closers de habla hispana**: gestiona el ciclo completo de la
llamada de venta — *confirmar → transcribir → resumen + feedback → seguimiento*.

Réplica del stack y el aspecto de **Apex Operations**, en un proyecto limpio desde cero.

> **Estado actual:** app funcional (Vite + React + backend `api/*` sobre Supabase).
> Transcripción y análisis con IA local (Ollama + Whisper) o Anthropic, CRM, ventas con
> verificación por justificante, métricas, perfil social (amigos, grupos, CV, ranking),
> secuencias de seguimiento y notificaciones.
>
> **Para levantarlo en otra máquina / VPS → [DEPLOY.md](./DEPLOY.md).**

## Documentación

- **[DEPLOY.md](./DEPLOY.md)** — cómo levantarlo en otra máquina o VPS (paso a paso).
- **[PDR.md](./PDR.md)** — alcance, stack, sistema de diseño, arquitectura, modelo de
  datos, roadmap y decisiones. Es la biblia del proyecto.

## Stack (a replicar)

Vite 7 · React 19 · react-router-dom 7 · framer-motion · lucide-react · recharts ·
Supabase · Anthropic SDK · Recall.ai · Vercel functions · (opcional) Tauri 2.
Estilos: CSS con tokens `var(--apex-*)`, 4 temas, **sin Tailwind**.

## Estructura

Ver el árbol completo en [PDR.md §11](./PDR.md#11-estructura-de-carpetas).
