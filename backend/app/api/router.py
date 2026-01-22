"""API Router - aggregates all API routes."""
from fastapi import APIRouter

from app.api.v1 import auth, analysis, system

api_router = APIRouter()

# Include v1 routes
api_router.include_router(auth.router)
api_router.include_router(analysis.router)
api_router.include_router(system.router)
