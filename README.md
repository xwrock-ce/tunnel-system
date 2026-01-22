# tunnel-system

Tunnel Over/Under Excavation Detection System for tunnel face images. This repo
includes a FastAPI backend that runs the ML pipeline and a React frontend that
drives uploads, monitoring, and reports.

## Features
- Tunnel face segmentation using YOLOv11 with optional SAM2 refinement.
- Excavation metrics: actual area, design area, and over/under deviation.
- Crack detection using a dedicated YOLO model.
- Real-time progress via WebSocket plus history and dashboard stats.
- JWT auth with a default admin user and SQLite persistence.

## Tech stack
- Backend: FastAPI, SQLAlchemy (async), SQLite, Ultralytics YOLO, OpenCV.
- Frontend: React, Vite, Ant Design, Zustand, Chart.js.
- Infra: Docker and docker-compose.

## Repo layout
- `backend/` FastAPI app, ML pipelines, database models.
- `frontend/` React UI and tests.
- `model_weights/` (create) YOLO and optional SAM2 assets.
- `uploads/` (auto) uploaded images and generated artifacts.
- `static/` (auto) public files if needed.
- `scripts/run_dev.sh` local dev launcher.

## Quick start (local dev)
Prereqs: Python 3.12, Node 20+, and `uv` installed.

1. Copy env file:
   `cp .env.example .env`
2. Put model weights in `model_weights/` (see below).
3. Run:
   `./scripts/run_dev.sh`

Services:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`

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
  - `sam2_configs/sam2.1/sam2.1_hiera_b+.yaml`

If SAM2 assets are missing, the system falls back to YOLO masks only.

## Configuration
Key environment variables (see `.env.example`):
- `SECRET_KEY` JWT signing secret.
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` default admin credentials.
- `DEBUG` enable SQLAlchemy echo logs.
- `YOLO_WEIGHTS`, `CRACK_YOLO_WEIGHTS` model filenames (in `model_weights/`).

## API overview
- `POST /api/v1/analysis` upload and start analysis.
- `POST /api/v1/analysis/batch` batch upload.
- `GET /api/v1/analysis/{id}` analysis details and image URLs.
- `GET /api/v1/analysis/ws/{id}` WebSocket progress.
- `GET /api/v1/system/status` system and model status.

## Notes
- The database is SQLite by default and is initialized on startup.
- The default admin user is created automatically if missing.
