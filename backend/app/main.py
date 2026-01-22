"""FastAPI Application Entry Point.

Tunnel Over/Under Excavation Detection System
Using YOLOv11 + SAM2 for tunnel face segmentation.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import init_db
from app.api.router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    print(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    await init_db()
    print("Database initialized")

    # Pre-load models (optional, for faster first request)
    try:
        from app.ml.pipeline import get_pipeline
        from app.ml.crack_pipeline import get_crack_pipeline
        pipeline = get_pipeline()
        # Trigger lazy loading
        _ = pipeline.yolo_model
        print("YOLO model loaded")
        crack_pipeline = get_crack_pipeline()
        _ = crack_pipeline.yolo_model
        print("Crack YOLO model loaded")
    except Exception as e:
        print(f"Model pre-loading skipped: {e}")

    yield

    # Shutdown
    print("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Tunnel Over/Under Excavation Detection API using YOLOv11 + SAM2",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for uploads
app.mount("/static", StaticFiles(directory=str(settings.STATIC_DIR)), name="static")

# Include API router
app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/")
async def root():
    """Root endpoint - API info."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "api": settings.API_V1_PREFIX
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
