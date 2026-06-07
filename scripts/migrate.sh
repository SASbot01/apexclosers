#!/usr/bin/env bash
# Aplica TODAS las migraciones (migrations/*.sql) en orden a una base Postgres.
#
# Uso:
#   DATABASE_URL='postgresql://user:pass@host:5432/db' ./scripts/migrate.sh
# o, si usas la CLI de Supabase local (docker):
#   ./scripts/migrate.sh --docker   (detecta el contenedor supabase_db_*)
set -euo pipefail
cd "$(dirname "$0")/.."

run_sql() { :; }

if [ "${1:-}" = "--docker" ]; then
  DB=$(docker ps --format '{{.Names}}' | grep -i 'supabase_db' | head -1)
  [ -z "$DB" ] && { echo "No encuentro el contenedor supabase_db_*. ¿Está arrancado 'supabase start'?"; exit 1; }
  echo "Aplicando migraciones en el contenedor: $DB"
  run_sql() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1; }
else
  : "${DATABASE_URL:?Define DATABASE_URL o usa --docker}"
  command -v psql >/dev/null || { echo "Necesitas psql (postgresql-client) o usa --docker"; exit 1; }
  echo "Aplicando migraciones a: ${DATABASE_URL%@*}@…"
  run_sql() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1; }
fi

for f in migrations/*.sql; do
  echo "→ $f"
  run_sql < "$f"
done
echo "✓ Migraciones aplicadas."
