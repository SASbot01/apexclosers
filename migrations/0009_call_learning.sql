-- 0009 · Aprendizaje sobre closing: guardamos las objeciones y la extracción
-- comercial completa de cada llamada, para (a) alimentar la tabla de ventas con
-- todos los campos y (b) dar feedback que mejora con el historial del closer.

alter table calls add column if not exists objections jsonb;   -- ["precio","pareja",...]
alter table calls add column if not exists extraction jsonb;   -- objeto completo extraído
