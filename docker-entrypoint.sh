#!/bin/sh
# Arranque de la API dentro del contenedor.
#
# A diferencia de Casino-cucuta (donde el DATABASE_URL de por defecto apunta a
# produccion y migrar automaticamente seria peligroso), aqui la base ES local
# y de desarrollo, asi que las migraciones SI corren por defecto -- de lo
# contrario habria que migrar a mano cada vez que alguien clona el proyecto.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] Aplicando migraciones pendientes (prisma migrate deploy)..."
  npx prisma migrate deploy
else
  echo "[entrypoint] RUN_MIGRATIONS=false -> se omiten las migraciones."
fi

exec "$@"
