#!/bin/sh
# Arranque de la API dentro del contenedor.
#
# Con docker-compose.yml (desarrollo) la base ES local, asi que las
# migraciones SI corren por defecto -- de lo contrario habria que migrar a
# mano cada vez que alguien clona el proyecto.
#
# Con docker-compose.prod.yml (Aiven, produccion real) RUN_MIGRATIONS viene
# en "false": ahi migrar solo automaticamente si seria peligroso, igual que
# en Casino-cucuta -- se corre a mano y a proposito cuando se decide (ver la
# nota de ese archivo).
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] Aplicando migraciones pendientes (prisma migrate deploy)..."
  npx prisma migrate deploy
else
  echo "[entrypoint] RUN_MIGRATIONS=false -> se omiten las migraciones."
fi

exec "$@"
