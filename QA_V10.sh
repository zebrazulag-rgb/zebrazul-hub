#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

node --check "$ROOT/backend/services/myWork.js"
node --check "$ROOT/backend/routes/myWork.js"
node --check "$ROOT/backend/server.js"
node --check "$ROOT/backend/services/permissions.js"
node --test "$ROOT/backend/tests/my-work.test.js"

echo "V10 backend: OK"
echo "Para o frontend, rode npm ci && npm run build no projeto completo."
