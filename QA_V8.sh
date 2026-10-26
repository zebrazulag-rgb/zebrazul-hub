#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "[1/4] Workflow frontend"
node --test frontend/tests/workflowState.test.js

echo "[2/4] Workflow backend"
node --test backend/tests/workflow-state.test.js

echo "[3/4] Sintaxe backend tocado pela V8"
node -c backend/utils/workflowState.js
node -c backend/routes/tasks.js
node -c backend/routes/public.js
node -c backend/services/designerApprovals.js

echo "[4/4] Dependências / build"
if [ -x frontend/node_modules/.bin/vite ]; then
  (cd frontend && npm run build)
else
  echo "AVISO: frontend/node_modules não está instalado; rode 'cd frontend && npm ci && npm run build'."
fi

echo "V8 QA básico concluído."
