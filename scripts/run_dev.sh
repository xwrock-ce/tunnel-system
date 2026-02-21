#!/bin/bash
# Development run script

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "=== Tunnel Excavation Detection System - Development Mode ==="

# If proxy points to localhost but local proxy service is down, disable it
# for this script run to avoid dependency install failures.
check_and_fix_proxy() {
    local proxy_val="${https_proxy:-${HTTPS_PROXY:-${http_proxy:-${HTTP_PROXY:-${all_proxy:-${ALL_PROXY:-}}}}}}"
    if [ -z "$proxy_val" ]; then
        return
    fi

    local hostport host port
    hostport="$(printf '%s' "$proxy_val" | sed -E 's#^[a-zA-Z]+://##; s#/.*$##')"
    host="${hostport%%:*}"
    port="${hostport##*:}"

    if [ -z "$host" ] || [ -z "$port" ] || [ "$host" = "$hostport" ]; then
        return
    fi

    if [ "$host" != "127.0.0.1" ] && [ "$host" != "localhost" ]; then
        return
    fi

    if ! (exec 3<>"/dev/tcp/$host/$port") >/dev/null 2>&1; then
        echo "WARNING: proxy $proxy_val is configured but not reachable."
        echo "WARNING: disabling *_proxy for this run."
        unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY
    else
        exec 3>&- 2>/dev/null || true
        exec 3<&- 2>/dev/null || true
    fi
}

check_and_fix_proxy

# Detect an available backend port (default 8000, auto-bump if busy)
is_port_in_use() {
    local port="$1"
    if command -v lsof >/dev/null 2>&1; then
        lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1
        return $?
    fi
    if command -v ss >/dev/null 2>&1; then
        ss -ltn | grep -Eq ":${port}(\\s|$)"
        return $?
    fi
    return 1
}

BACKEND_PORT="${PORT:-8000}"
if is_port_in_use "$BACKEND_PORT"; then
    if [ -n "${PORT:-}" ]; then
        echo "ERROR: PORT $BACKEND_PORT is already in use."
        exit 1
    fi
    BACKEND_PORT=8001
    while is_port_in_use "$BACKEND_PORT"; do
        BACKEND_PORT=$((BACKEND_PORT + 1))
    done
    echo "WARNING: port 8000 is already in use, switching backend to $BACKEND_PORT."
fi

# Check model weights (non-blocking)
MODEL_DIR="$PROJECT_DIR/model_weights"
YOLO_WEIGHTS_FILE="yolo_best.pt"
CRACK_WEIGHTS_FILE="crack_best.pt"

if [ -f ".env" ]; then
    YOLO_FROM_ENV="$(grep -E '^YOLO_WEIGHTS=' .env | tail -n1 | cut -d= -f2- | tr -d '\"' | tr -d "'")"
    CRACK_FROM_ENV="$(grep -E '^CRACK_YOLO_WEIGHTS=' .env | tail -n1 | cut -d= -f2- | tr -d '\"' | tr -d "'")"
    if [ -n "$YOLO_FROM_ENV" ]; then
        YOLO_WEIGHTS_FILE="$YOLO_FROM_ENV"
    fi
    if [ -n "$CRACK_FROM_ENV" ]; then
        CRACK_WEIGHTS_FILE="$CRACK_FROM_ENV"
    fi
fi

MISSING_WEIGHTS=false
if [ ! -f "$MODEL_DIR/$YOLO_WEIGHTS_FILE" ]; then
    echo "WARNING: missing YOLO weights: $MODEL_DIR/$YOLO_WEIGHTS_FILE"
    MISSING_WEIGHTS=true
fi
if [ ! -f "$MODEL_DIR/$CRACK_WEIGHTS_FILE" ]; then
    echo "WARNING: missing crack weights: $MODEL_DIR/$CRACK_WEIGHTS_FILE"
    MISSING_WEIGHTS=true
fi
if [ "$MISSING_WEIGHTS" = true ]; then
    echo "WARNING: model weights are required for analysis."
    echo "Place files under $MODEL_DIR or update .env (YOLO_WEIGHTS/CRACK_YOLO_WEIGHTS)."
fi

# Check if backend virtual environment exists (used by Python ML worker)
if [ ! -d "backend/.venv" ]; then
    echo "Creating backend virtual environment..."
    cd backend
    uv venv -p python3.12
    uv pip install -e .
    cd ..
else
    BACKEND_PY_VERSION="$(backend/.venv/bin/python -c 'import sys; print(f\"{sys.version_info.major}.{sys.version_info.minor}\")' 2>/dev/null || true)"
    if [ "$BACKEND_PY_VERSION" = "3.13" ]; then
        echo "Detected backend venv using Python $BACKEND_PY_VERSION, which may break some ML dependencies."
        echo "Please remove backend/.venv and rerun this script (it will recreate with Python 3.12)."
        exit 1
    fi
fi

echo "Checking backend Python ML dependencies..."
cd backend
if .venv/bin/python - <<'PY'
import importlib.util
required = ("ultralytics", "cv2", "torch", "numpy", "hydra", "iopath")
missing = [name for name in required if importlib.util.find_spec(name) is None]
if missing:
    raise SystemExit(1)
PY
then
    echo "Backend ML dependencies already available, skipping sync."
else
    echo "Installing backend Python ML dependencies..."
    if ! uv pip install -e .; then
        echo "ERROR: failed to install backend Python dependencies and required modules are missing."
        echo "If you are behind a proxy, start your proxy service or unset *_proxy env vars."
        exit 1
    fi
fi
cd ..

# Ensure Go dependencies are available
echo "Preparing Go backend dependencies..."
cd backend
if ! go mod download; then
    echo "WARNING: failed to download Go modules. Continuing with local module cache."
    echo "If build later fails, start your proxy service or unset *_proxy env vars."
fi
cd ..

# Check if frontend dependencies are installed
if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
fi

# Function to cleanup on exit
cleanup() {
    echo "Stopping services..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend
echo "Starting backend on http://localhost:$BACKEND_PORT..."
cd backend
source .venv/bin/activate
PORT="$BACKEND_PORT" ANALYZER_MODE="${ANALYZER_MODE:-python}" go run ./cmd/server &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 3

# Start frontend
echo "Starting frontend on http://localhost:3000..."
cd frontend
VITE_API_URL="${VITE_API_URL:-http://localhost:$BACKEND_PORT}" npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=== Services Started ==="
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:$BACKEND_PORT"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for processes
wait
