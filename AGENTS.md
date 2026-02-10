# Repository Guidelines

## Project Structure & Module Organization
- `backend/app/` holds the FastAPI application: `api/` routers, `ml/` pipelines, `db/` setup, and `models/` schemas.
- `frontend/src/` contains the React UI, with route pages in `pages/`, shared UI in `components/`, API calls in `api/`, and Zustand stores in `stores/`.
- `scripts/run_dev.sh` bootstraps local dev and starts both services.
- `model_weights/`, `uploads/`, and `static/` are runtime assets (weights and generated files) and are git-ignored.

## Build, Test, and Development Commands
- `cp .env.example .env` to create local configuration before running services.
- `./scripts/run_dev.sh` creates the backend venv (Python 3.12 via `uv`), installs deps, and runs backend + frontend.
- `docker compose up --build` runs the full stack in containers (frontend on `:80`, backend on `:8000`).
- `cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` runs the API locally if you want backend only.
- `cd frontend && npm run dev` for local UI dev, `npm run build` for production build, and `npm run preview` to preview the build.

## Coding Style & Naming Conventions
- Python uses 4-space indentation; modules and functions use `snake_case` (see `backend/app/`).
- TypeScript/React uses 2-space indentation; components are `PascalCase` and hooks/stores are `useXxx` (see `frontend/src/`).
- Prefer clear, descriptive names for analysis artifacts (e.g., `analysis_type`, `difference_percent`) to match API payloads.

## Testing Guidelines
- Frontend tests live in `frontend/tests/*.spec.ts` and use Playwright; run with `cd frontend && npx playwright test`.
- Test artifacts (e.g., `test-results/`, `playwright-report/`) are ignored; don’t commit screenshots unless requested.
- Backend lists `pytest` in dev dependencies; add tests under `backend/tests/` and run `pytest` once dev deps are installed.

## Commit & Pull Request Guidelines
- Follow Conventional Commit style seen in history: `feat: ...`, `docs: ...` (short, present-tense summaries).
- PRs should include a clear summary, test commands run, and screenshots for UI changes.
- Do not commit `.env`, model weights, databases, or uploads; reference paths and config changes in the PR instead.

## Configuration & Asset Notes
- Model weights are required for analysis; set filenames in `.env` (`YOLO_WEIGHTS`, `CRACK_YOLO_WEIGHTS`) and place files in `model_weights/`.
- SQLite is the default local datastore; it is created at runtime and should remain untracked.
