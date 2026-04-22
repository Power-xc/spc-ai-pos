#!/bin/bash
# FoxPOS PoC Development Startup Script
# Usage: ./scripts/start-dev.sh [backend|pip-pos|mobile|hq-pos|all]

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
    echo "Starting PIP POS on port 5181..."
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
    echo "Starting Mobile on port 5186..."
    cd "$PROJECT_ROOT/pip-pos"
    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        npm install
    fi
    npx vite --config vite.mobile.config.ts --host 0.0.0.0 --port 5186 &
    MOBILE_PID=$!
    echo "Mobile PID: $MOBILE_PID"
}

start_hq_pos() {
    echo "Starting HQ POS on port 5173..."
    cd "$PROJECT_ROOT/hq-pos"
    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        npm install
    fi
    npx vite --host 0.0.0.0 --port 5173 &
    HQ_PID=$!
    echo "HQ POS PID: $HQ_PID"
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
    hq-pos)
        start_hq_pos
        ;;
    all)
        start_backend
        sleep 3
        start_pip_pos
        start_mobile
        start_hq_pos
        echo ""
        echo "=== All services started ==="
        echo "Backend:    http://localhost:8100"
        echo "PIP POS:    http://localhost:5181"
        echo "Mobile:     http://localhost:5186/index.mobile.html"
        echo "HQ POS:     http://localhost:5173/mockup/pos-shell.html"
        ;;
    *)
        echo "Usage: $0 [backend|pip-pos|mobile|hq-pos|all]"
        exit 1
        ;;
esac

wait
