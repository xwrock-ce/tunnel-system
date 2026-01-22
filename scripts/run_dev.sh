#!/bin/bash
# Development run script

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "=== Tunnel Excavation Detection System - Development Mode ==="

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

# Check if backend virtual environment exists
if [ ! -d "backend/.venv" ]; then
    echo "Creating backend virtual environment..."
    cd backend
    uv venv -p python3.12
    uv pip install -e .
    cd ..
else
    BACKEND_PY_VERSION="$(backend/.venv/bin/python -c 'import sys; print(f\"{sys.version_info.major}.{sys.version_info.minor}\")' 2>/dev/null || true)"
    if [ "$BACKEND_PY_VERSION" = "3.13" ]; then
        echo "Detected backend venv using Python $BACKEND_PY_VERSION, which can cause SQLite async hangs."
        echo "Please remove backend/.venv and rerun this script (it will recreate with Python 3.12)."
        exit 1
    fi
fi

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
echo "Starting backend on http://localhost:8000..."
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 3

# Start frontend
echo "Starting frontend on http://localhost:3000..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=== Services Started ==="
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:8000"
echo "API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for processes
wait
