#!/usr/bin/env sh
# Runs migrations (forward only, 02 section 5) when RUN_MIGRATIONS=true, then starts the API or the worker.
set -eu

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] applying migrations"
  ./node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma
fi

if [ "${WORKER_ENABLED:-false}" = "true" ]; then
  echo "[entrypoint] starting worker"
else
  echo "[entrypoint] starting api on port ${PORT:-4000}"
fi
exec node dist/src/main.js
