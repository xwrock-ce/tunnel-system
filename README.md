# tunnel-system

Tunnel Over/Under Excavation Detection System for tunnel face images. This repo
includes a Go backend that runs the API orchestration plus a Python ML worker,
and a React frontend that
drives uploads, monitoring, and reports.

## Features
- Tunnel face segmentation using YOLOv11 with optional SAM2 refinement.
- Excavation metrics: actual area, design area, and over/under deviation.
- Crack detection using a dedicated YOLO model.
- Real-time progress via WebSocket plus history and dashboard stats.
- JWT auth with a default admin user and SQLite persistence.

## Tech stack
- Backend API: Go (chi), SQLite (GORM), JWT auth, WebSocket.
- ML worker: Python, Ultralytics YOLO, OpenCV, optional SAM2.
- Frontend: React, Vite, Ant Design, Zustand, Chart.js.
- Infra: Docker and docker-compose.

## Repo layout
- `backend/` Go API service (`cmd/`, `internal/`) and Python ML worker (`app/`, `ml_worker/`).
- `frontend/` React UI and tests.
- `model_weights/` (create) YOLO and optional SAM2 assets.
- `uploads/` (auto) uploaded images and generated artifacts.
- `static/` (auto) public files if needed.
- `scripts/run_dev.sh` local dev launcher.

## Before you start (weights are required)
This repo does not include model weights. Ask the author for the weights and
place them under `model_weights/`. Filenames are read from `.env`:
- `YOLO_WEIGHTS` for tunnel face segmentation (default `yolo_best.pt`)
- `CRACK_YOLO_WEIGHTS` for crack detection (default `crack_best.pt`)

## Quick start (local dev)
Prereqs: Go 1.22+, Python 3.12, Node 20+, and `uv` installed.

1. Copy env file:
   `cp .env.example .env`
2. Put model weights in `model_weights/` (see below).
3. Run:
   `./scripts/run_dev.sh`

Services:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

## Docker
1. `cp .env.example .env`
2. `docker compose up --build`

Services:
- Frontend: `http://localhost`
- Backend: `http://localhost:8000`

## Model assets
Expected files under `model_weights/`:
- `yolo_best.pt` (tunnel face segmentation)
- `crack_best.pt` (crack detection)
- Optional SAM2 assets if you want refinement:
  - `sam2_base.pt`
  - `sam2_finetuned.pt` (optional)
  - SAM2 配置由 `SAM2_CONFIG` 指定（默认 `configs/sam2.1/sam2.1_hiera_b+.yaml`）

If SAM2 assets are missing:
- with `SAM2_STRICT_FACE_SEGMENTATION=true` (default), face segmentation fails fast.
- with `SAM2_STRICT_FACE_SEGMENTATION=false`, the pipeline falls back to YOLO masks.

## Configuration
Key environment variables (see `.env.example`):
- `SECRET_KEY` JWT signing secret.
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` default admin credentials.
- `DEBUG` enable debug logs.
- `YOLO_WEIGHTS`, `CRACK_YOLO_WEIGHTS` model filenames (in `model_weights/`).
- `ANALYZER_MODE` set `python` (default) or `mock` (for testing/no weights).
- `SAM2_STRICT_FACE_SEGMENTATION` if `true`, face segmentation fails unless final mask is produced by SAM2.

## API overview
- `POST /api/v1/analysis` upload and start analysis.
- `POST /api/v1/analysis/batch` batch upload.
- `GET /api/v1/analysis/{id}` analysis details and image URLs.
- `GET /api/v1/analysis/ws/{id}` WebSocket progress.
- `GET /api/v1/system/status` system and model status.

## Notes
- The database is SQLite by default and is initialized on startup.
- The default admin user is created automatically if missing.

## Troubleshooting
- `YOLO weights not found` means the file is missing in `model_weights/` or the
  filename in `.env` does not match the actual file.
- `SAM2 skipped: missing checkpoint files` means SAM2 checkpoint is missing.
  In strict mode (`SAM2_STRICT_FACE_SEGMENTATION=true`), face segmentation fails.
  If strict mode is disabled, the pipeline falls back to YOLO masks.
- If the backend starts but analysis fails, verify the two required weight files
  and their names.
