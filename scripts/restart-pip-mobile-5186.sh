#!/usr/bin/env bash
set -euo pipefail

LOGFILE="/tmp/foxpos-pip-mobile-5186.log"
APP_DIR="/data/sapie/tax/foxpos-workspace/foxpos-poc-clean/pip-mobile"

# Kill existing process on 5186
if ss -ltnp | grep -q ':5186'; then
    echo "[pip-mobile] Killing existing process on port 5186..."
    for pid in $(ss -ltnp | grep ':5186' | grep -oP 'pid=\K[0-9]+'); do
        kill "$pid" 2>/dev/null || true
    done
    sleep 2
    if ss -ltnp | grep -q ':5186'; then
        echo "[pip-mobile] Force killing..."
        for pid in $(ss -ltnp | grep ':5186' | grep -oP 'pid=\K[0-9]+'); do
            kill -9 "$pid" 2>/dev/null || true
        done
    fi
fi

echo "[pip-mobile] Starting pip-mobile on port 5186..."
cd "$APP_DIR"
nohup npm run dev >> "$LOGFILE" 2>&1 &

sleep 4

if ss -ltnp | grep -q ':5186'; then
    echo "[pip-mobile] SUCCESS - listening on 5186"
else
    echo "[pip-mobile] FAILED - not listening. Check $LOGFILE"
    exit 1
fi

echo "[pip-mobile] Log file: $LOGFILE"
