-- 0007 · resumen estructurado del lead (generado por IA al terminar la llamada).
-- { objetivos, bloqueos, compromiso, cualificacion, financiera, prioridad, decision }
alter table leads add column if not exists summary jsonb;
alter table calls add column if not exists lead_summary jsonb;
-- Al enlazar una llamada con un lead (cuando se automatice), se copia
-- calls.lead_summary → leads.summary y aparece en la ficha del lead.
