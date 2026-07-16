#!/bin/bash
# PIP AI POS PoC — local development launcher
# Usage: ./scripts/start-dev.sh [backend|pip-pos|mobile|all]

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

start_backend() {
    echo "Starting backend on port 8100..."
    cd "$PROJECT_ROOT/backend"
    if [ ! -f ".env" ]; then
        echo "Warning: .env not found. Copy from .env.example and edit."
        cp .env.example .env 2>/dev/null || true
    fi
    uvicorn app.main:app --host 0.0.0.0 --port 8100 --reload &
    BACKEND_PID=$!
    echo "Backend PID: $BACKEND_PID"
}

start_pip_pos() {
    echo "Starting PIP POS (desktop) on port 5181..."
    cd "$PROJECT_ROOT/pip-pos"
    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        npm install
    fi
    npx vite --host 0.0.0.0 --port 5181 &
    PIP_PID=$!
    echo "PIP POS PID: $PIP_PID"
}

start_mobile() {
    echo "Starting PIP Mobile (pip-mobile) on port 5186..."
    cd "$PROJECT_ROOT/pip-mobile"
    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        npm install
    fi
    npx vite --config vite.mobile.config.ts --host 0.0.0.0 --port 5186 &
    MOBILE_PID=$!
    echo "Mobile PID: $MOBILE_PID"
}

case "${1:-all}" in
    backend)
        start_backend
        ;;
    pip-pos)
        start_pip_pos
        ;;
    mobile)
        start_mobile
        ;;
    all)
        start_backend
        sleep 3
        start_pip_pos
        start_mobile
        echo ""
        echo "=== All services started ==="
        echo "Backend:    http://localhost:8100"
        echo "PIP POS:    http://localhost:5181"
        echo "PIP Mobile: http://localhost:5186/index.mobile.html"
        ;;
    *)
        echo "Usage: $0 [backend|pip-pos|mobile|all]"
        exit 1
        ;;
esac

wait
