#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/backend"
node --check services/smartAlerts.js
node --check routes/smartAlerts.js
node --check server.js
node --check services/permissions.js
node --test tests/smart-alerts.test.js tests/my-work.test.js tests/workflow-state.test.js
printf '\nBackend lógico da V11: OK\n'
printf 'Rode também: (cd frontend && npm ci && npm run build)\n'
