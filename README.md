# tunnel-system

Tunnel-face analysis system for over/under-excavation and crack detection.
This repo combines a Go backend API, a Python ML worker, and a React frontend
for upload, monitoring, visualization, and reporting.

## Overview
- Purpose: analyze tunnel-face imagery for excavation deviation and crack risk.
- Architecture: Go backend API + Python ML worker + React frontend.
- Core flow: REST creates analysis tasks, WebSocket pushes progress, SQLite stores users and results.
- Auth: JWT bearer auth with a default admin user loaded from environment config.

## Features
- Tunnel face segmentation using YOLO with optional SAM2 refinement.
- Excavation metrics including actual area, design area, and over/under deviation.
- Crack detection using a dedicated model.
- Real-time progress updates over WebSocket.
- Analysis history, dashboard stats, and generated result images.
- OpenAPI docs at `/docs` and raw spec at `/openapi.yaml`.

## Stack
- Backend: Go `1.26`, `chi`, `GORM`, SQLite, JWT, Gorilla WebSocket.
- ML worker: Python `>=3.10,<3.13` (prefer `3.12`), Ultralytics YOLO, OpenCV, optional SAM2.
- Frontend: React `18`, Vite `6`, Ant Design `5`, Zustand, Chart.js.
- Tooling: `uv`, Node.js `20+`, Docker Compose.

## Key Paths
- `backend/cmd/server/`: Go server entrypoint.
- `backend/internal/`: backend packages.
- `backend/internal/api/`: HTTP routes, response types, OpenAPI docs assets.
- `backend/app/`: Python modules and settings.
- `backend/ml_worker/analyze.py`: Python worker entry used by Go.
- `frontend/src/`: React app source.
- `frontend/tests/`: Playwright specs/helpers.
- `scripts/run_dev.sh`: local full-stack dev launcher.
- `model_weights/`: local model assets for real analysis.

## Before You Start
This repo does not include model weights. Put them under `model_weights/`.
The default filenames come from `.env`:
- `YOLO_WEIGHTS` → tunnel face model, default `yolo_best.pt`
- `CRACK_YOLO_WEIGHTS` → crack model, default `crack_best.pt`

## Quick Start
Prereqs: Go `1.26+`, Python `3.12`, Node.js `20+`, and `uv`.

1. Create env file: `cp .env.example .env`
2. Put required model weights in `model_weights/`
3. Start local dev: `./scripts/run_dev.sh`

Default local URLs:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`

Notes:
- `scripts/run_dev.sh` auto-creates `backend/.venv`
- it prefers Python `3.12` and rejects Python `3.13`
- if port `8000` is busy, backend auto-increments to the next available port

## Common Commands
- Full local dev: `./scripts/run_dev.sh`
- Backend only: `cd backend && go run ./cmd/server`
- Backend mock mode: `cd backend && ANALYZER_MODE=mock go run ./cmd/server`
- Frontend only: `cd frontend && npm run dev`
- Docker dev: `docker compose up --build`
- Prod compose template: `docker compose -f docker-compose.prod.yml up -d`

## API & Docs
- Swagger UI: `GET /docs`
- OpenAPI spec: `GET /openapi.yaml`
- Main API prefix: `/api/v1`
- Common endpoints:
  - `POST /api/v1/auth/login`
  - `GET /api/v1/auth/me`
  - `POST /api/v1/analysis`
  - `POST /api/v1/analysis/batch`
  - `GET /api/v1/analysis/{id}`
  - `GET /api/v1/analysis/ws/{id}`
  - `GET /api/v1/system/status`

## Configuration
`.env.example` is minimal. Full defaults live in:
- `backend/internal/config/config.go`
- `backend/app/config.py`

Common env vars:
- Auth: `SECRET_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`
- Runtime: `PORT`, `DEBUG`, `ANALYZER_MODE`, `PYTHON_EXEC`, `DATABASE_URL`
- Models: `YOLO_WEIGHTS`, `CRACK_YOLO_WEIGHTS`
- SAM2: `SAM2_STRICT_FACE_SEGMENTATION`, `SAM2_CONFIG`, `SAM2_BASE_CHECKPOINT`, `SAM2_FINETUNED_CHECKPOINT`
- Analysis: `SCALE_MM_PER_PIXEL`, `DESIGN_AREA_M2`, `MAX_UPLOAD_SIZE`
- Frontend: `VITE_API_URL`

Behavior notes:
- Default analyzer mode is `python`
- use `ANALYZER_MODE=mock` when weights are unavailable
- with `SAM2_STRICT_FACE_SEGMENTATION=true`, face segmentation fails if SAM2 cannot produce the final mask
- with `SAM2_STRICT_FACE_SEGMENTATION=false`, the pipeline falls back to YOLO masks

## Model Assets
Expected files under `model_weights/`:
- `yolo_best.pt`
- `crack_best.pt`
- optional SAM2 assets:
  - `sam2_base.pt`
  - `sam2_finetuned.pt`
  - `SAM2_CONFIG` defaults to `configs/sam2.1/sam2.1_hiera_b+.yaml`

## Checks
- Go tests: `cd backend && go test ./...`
- Python tests: `cd backend && uv run pytest tests -q`
- Frontend lint: `cd frontend && npm run lint`
- Frontend build: `cd frontend && npm run build`
- Frontend E2E: `cd frontend && npx playwright test`

## Troubleshooting
- `YOLO weights not found`: check filenames in `model_weights/` and `.env`
- `SAM2 skipped: missing checkpoint files`: provide SAM2 checkpoints or disable strict segmentation
- backend starts but analysis fails: verify both required weight files and filenames
- old admin credentials still work after deployment: re-check `.env` and persistent database state

## Notes
- The database defaults to SQLite and is initialized on startup.
- The configured admin user is created automatically if missing and synced from environment config.
