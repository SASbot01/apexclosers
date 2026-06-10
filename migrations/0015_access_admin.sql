-- 0015 · Control de acceso (software de pago) + rol admin.
-- Cada usuario tiene un estado de ACCESO que controla el admin:
--   pending  → se registró con Google pero aún no le hemos dado el OK (no entra)
--   approved → acceso concedido (usa el software)
--   blocked  → bloqueado (infringió normas)
alter table users add column if not exists access text default 'pending';

-- Los usuarios que YA existían entran aprobados (no los echamos al activar esto).
update users set access = 'approved' where access is null or access = 'pending';

-- account_type ya admite 'closer' | 'client'; ahora también 'admin'.
-- (el admin se provisiona con api/auth?action=create-account, secreto admin).
