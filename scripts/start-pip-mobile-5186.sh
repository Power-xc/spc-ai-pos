#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/data/sapie/tax/foxpos-workspace/foxpos-poc-clean/pip-mobile"

cd "$APP_DIR"

echo "[pip-mobile] cwd=$(pwd)"
echo "[pip-mobile] starting on 0.0.0.0:5186"

exec npm run dev -- --host 0.0.0.0 --port 5186
