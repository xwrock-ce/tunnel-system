"""Analysis API endpoints."""
import uuid
import asyncio
from pathlib import Path
from typing import Optional, List
from datetime import datetime
import shutil

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models.database import User, Analysis, AnalysisStatus, AnalysisType
from app.api.v1.auth import get_current_user
from app.api.schemas import (
    AnalysisResponse, AnalysisCreate, AnalysisListItem, AnalysisList,
    BatchAnalysisCreate, ExcavationResult, SegmentationMetrics, StatsResponse,
    TrendResponse, DeviationDistribution
)
from app.services.analysis import AnalysisService

router = APIRouter(prefix="/analysis", tags=["Analysis"])

# Store WebSocket connections for progress updates
active_connections: dict = {}


def validate_file(file: UploadFile) -> None:
    """Validate uploaded file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {settings.ALLOWED_EXTENSIONS}"
        )


async def save_upload(file: UploadFile, analysis_id: int) -> Path:
    """Save uploaded file to disk."""
    ext = file.filename.rsplit(".", 1)[-1].lower()
    filename = f"{analysis_id}_original.{ext}"
    file_path = settings.UPLOAD_DIR / filename

    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    return file_path


async def run_analysis_task(analysis_id: int, db_url: str):
    """Background task to run analysis."""
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker

    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        service = AnalysisService(session)

        # Progress callback for WebSocket
        def progress_callback(stage: str, progress: int, message: str):
            if analysis_id in active_connections:
                ws = active_connections[analysis_id]
                try:
                    asyncio.create_task(ws.send_json({
                        "type": "progress",
                        "stage": stage,
                        "progress": progress,
                        "message": message
                    }))
                except Exception:
                    pass

        try:
            await service.run_analysis(analysis_id, progress_callback)

            # Send completion
            if analysis_id in active_connections:
                ws = active_connections[analysis_id]
                try:
                    await ws.send_json({
                        "type": "result",
                        "stage": "completed",
                        "progress": 100,
                        "message": "Analysis completed successfully"
                    })
                except Exception:
                    pass

        except Exception as e:
            # Send error
            if analysis_id in active_connections:
                ws = active_connections[analysis_id]
                try:
                    await ws.send_json({
                        "type": "error",
                        "stage": "failed",
                        "progress": 0,
                        "message": str(e)
                    })
                except Exception:
                    pass

    await engine.dispose()


@router.post("", response_model=AnalysisCreate)
async def create_analysis(
    background_tasks: BackgroundTasks,
    image: UploadFile = File(...),
    design_area: float = Form(default=78.5),
    scale: float = Form(default=7.6),
    analysis_type: str = Form(default="full"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload an image and create an analysis task.

    Args:
        analysis_type: Type of analysis to perform:
            - "face_segmentation": Only tunnel face segmentation
            - "crack_detection": Only crack detection
            - "full": Both face segmentation and crack detection (default)
    """
    validate_file(image)
    if design_area <= 0:
        raise HTTPException(status_code=400, detail="design_area must be > 0")
    if scale <= 0:
        raise HTTPException(status_code=400, detail="scale must be > 0")

    # Validate analysis_type
    valid_types = [t.value for t in AnalysisType]
    if analysis_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid analysis_type. Must be one of: {valid_types}")

    service = AnalysisService(db)

    # Create analysis record
    analysis = await service.create_analysis(
        user_id=current_user.id,
        image_path="",  # Will update after saving
        design_area=design_area,
        scale=scale,
        analysis_type=analysis_type
    )

    # Save uploaded file
    file_path = await save_upload(image, analysis.id)
    analysis.original_image = str(file_path)
    await db.commit()

    # Start background analysis
    background_tasks.add_task(
        run_analysis_task,
        analysis.id,
        settings.DATABASE_URL
    )

    return AnalysisCreate(
        id=analysis.id,
        status=analysis.status,
        message="Analysis task created. Connect to WebSocket for progress updates."
    )


@router.post("/batch", response_model=BatchAnalysisCreate)
async def create_batch_analysis(
    background_tasks: BackgroundTasks,
    images: List[UploadFile] = File(...),
    design_area: float = Form(default=78.5),
    scale: float = Form(default=7.6),
    analysis_type: str = Form(default="full"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload multiple images for batch analysis.

    Args:
        analysis_type: Type of analysis to perform:
            - "face_segmentation": Only tunnel face segmentation
            - "crack_detection": Only crack detection
            - "full": Both face segmentation and crack detection (default)
    """
    if len(images) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 images per batch")
    if design_area <= 0:
        raise HTTPException(status_code=400, detail="design_area must be > 0")
    if scale <= 0:
        raise HTTPException(status_code=400, detail="scale must be > 0")

    # Validate analysis_type
    valid_types = [t.value for t in AnalysisType]
    if analysis_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid analysis_type. Must be one of: {valid_types}")

    service = AnalysisService(db)
    task_ids = []
    batch_id = str(uuid.uuid4())

    for image in images:
        validate_file(image)

        # Create analysis record
        analysis = await service.create_analysis(
            user_id=current_user.id,
            image_path="",
            design_area=design_area,
            scale=scale,
            analysis_type=analysis_type
        )

        # Save uploaded file
        file_path = await save_upload(image, analysis.id)
        analysis.original_image = str(file_path)
        await db.commit()

        task_ids.append(analysis.id)

        # Start background analysis
        background_tasks.add_task(
            run_analysis_task,
            analysis.id,
            settings.DATABASE_URL
        )

    return BatchAnalysisCreate(
        batch_id=batch_id,
        task_ids=task_ids,
        total=len(task_ids)
    )


@router.get("/{analysis_id}", response_model=AnalysisResponse)
async def get_analysis(
    analysis_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get analysis result by ID."""
    service = AnalysisService(db)
    analysis = await service.get_analysis(analysis_id)

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    if analysis.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Build response
    response = AnalysisResponse(
        id=analysis.id,
        status=analysis.status,
        analysis_type=analysis.analysis_type,
        design_area_m2=analysis.design_area_m2 or settings.DESIGN_AREA_M2,
        scale_mm_per_pixel=analysis.scale_mm_per_pixel or settings.SCALE_MM_PER_PIXEL,
        original_image_url=f"/api/v1/analysis/{analysis.id}/image/original" if analysis.original_image else None,
        mask_image_url=f"/api/v1/analysis/{analysis.id}/image/mask" if analysis.mask_image else None,
        overlay_image_url=f"/api/v1/analysis/{analysis.id}/image/overlay" if analysis.overlay_image else None,
        crack_mask_image_url=f"/api/v1/analysis/{analysis.id}/image/crack_mask" if analysis.crack_mask_image else None,
        crack_overlay_image_url=f"/api/v1/analysis/{analysis.id}/image/crack_overlay" if analysis.crack_overlay_image else None,
        combined_overlay_image_url=f"/api/v1/analysis/{analysis.id}/image/combined_overlay" if analysis.combined_overlay_image else None,
        error_message=analysis.error_message,
        created_at=analysis.created_at,
        completed_at=analysis.completed_at
    )

    if analysis.status == AnalysisStatus.COMPLETED.value:
        # Set excavation result if face segmentation was performed
        if analysis.pixel_count:
            response.excavation = ExcavationResult(
                pixel_count=analysis.pixel_count,
                actual_area_m2=analysis.actual_area_m2,
                design_area_m2=analysis.design_area_m2 or settings.DESIGN_AREA_M2,
                difference_m2=analysis.difference_m2,
                difference_percent=analysis.difference_percent,
                status=analysis.excavation_status
            )

        # Always set metrics for completed analyses (includes crack detection results)
        response.metrics = SegmentationMetrics(
            confidence=analysis.confidence or 0.0,
            mask_quality="high" if analysis.confidence and analysis.confidence > 0.8 else ("medium" if analysis.confidence else None),
            crack_confidence=analysis.crack_confidence,
            crack_count=analysis.crack_count,
            crack_pixel_count=analysis.crack_pixel_count,
        )

    return response


@router.get("/{analysis_id}/image/{image_type}")
async def get_analysis_image(
    analysis_id: int,
    image_type: str,
    db: AsyncSession = Depends(get_db)
):
    """Get analysis image (original, mask, or overlay).

    Note: This endpoint is public (no auth required) because:
    1. The analysis_id serves as an access token
    2. Browser <img> tags cannot send Authorization headers
    """
    service = AnalysisService(db)
    analysis = await service.get_analysis(analysis_id)

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    if image_type == "original":
        path = analysis.original_image
    elif image_type == "mask":
        path = analysis.mask_image
    elif image_type == "overlay":
        path = analysis.overlay_image
    elif image_type == "crack_mask":
        path = analysis.crack_mask_image
    elif image_type == "crack_overlay":
        path = analysis.crack_overlay_image
    elif image_type == "combined_overlay":
        path = analysis.combined_overlay_image
    else:
        raise HTTPException(status_code=400, detail="Invalid image type")

    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(path)


@router.delete("/{analysis_id}")
async def delete_analysis(
    analysis_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete an analysis record."""
    service = AnalysisService(db)
    deleted = await service.delete_analysis(analysis_id, current_user.id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Analysis not found")

    return {"message": "Analysis deleted successfully"}


@router.get("", response_model=AnalysisList)
async def list_analyses(
    page: int = 1,
    limit: int = 20,
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get paginated list of analyses."""
    if limit > 100:
        limit = 100

    service = AnalysisService(db)
    items, total = await service.get_user_analyses(
        user_id=current_user.id,
        page=page,
        limit=limit,
        status_filter=status,
        search_query=search
    )

    return AnalysisList(
        items=[
            AnalysisListItem(
                id=a.id,
                status=a.status,
                excavation_status=a.excavation_status,
                actual_area_m2=a.actual_area_m2,
                difference_percent=a.difference_percent,
                created_at=a.created_at
            ) for a in items
        ],
        total=total,
        page=page,
        pages=(total + limit - 1) // limit
    )


@router.get("/stats/dashboard", response_model=StatsResponse)
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get dashboard statistics."""
    service = AnalysisService(db)
    stats = await service.get_stats(current_user.id)
    return StatsResponse(**stats)


@router.get("/stats/trend", response_model=TrendResponse)
async def get_trend_data(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get trend data for dashboard chart.

    Returns the most recent N completed analyses with excavation data,
    formatted for Chart.js line chart display.

    Args:
        limit: Maximum number of data points (default 20, max 100)
    """
    if limit > 100:
        limit = 100
    if limit < 1:
        limit = 20

    service = AnalysisService(db)
    trend_data = await service.get_trend_data(current_user.id, limit)
    return TrendResponse(**trend_data)


@router.get("/stats/distribution", response_model=DeviationDistribution)
async def get_deviation_distribution(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get deviation distribution statistics.

    Returns counts of analyses grouped by deviation severity:
    - Severe over-excavation (>5%)
    - Minor over-excavation (2-5%)
    - Normal (within ±2%)
    - Minor under-excavation (-2% to -5%)
    - Severe under-excavation (<-5%)
    """
    service = AnalysisService(db)
    distribution = await service.get_deviation_distribution(current_user.id)
    return DeviationDistribution(**distribution)


@router.websocket("/ws/{analysis_id}")
async def websocket_progress(
    websocket: WebSocket,
    analysis_id: int
):
    """WebSocket endpoint for real-time progress updates."""
    await websocket.accept()
    active_connections[analysis_id] = websocket

    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        if analysis_id in active_connections:
            del active_connections[analysis_id]
