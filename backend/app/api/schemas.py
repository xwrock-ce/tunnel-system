"""Pydantic schemas for API requests and responses."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# Auth schemas
class Token(BaseModel):
    """JWT token response."""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """JWT token payload data."""
    username: Optional[str] = None


class LoginRequest(BaseModel):
    """Login request."""
    username: str
    password: str


class UserResponse(BaseModel):
    """User response."""
    id: int
    username: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Analysis schemas
class AnalysisParams(BaseModel):
    """Analysis parameters."""
    design_area_m2: float = Field(default=78.5, description="Design profile area in m2")
    scale_mm_per_pixel: float = Field(default=7.6, description="Scale in mm per pixel")


class ExcavationResult(BaseModel):
    """Excavation analysis result."""
    pixel_count: int = Field(description="Number of white pixels in mask")
    actual_area_m2: float = Field(description="Actual excavated area in m2")
    design_area_m2: float = Field(description="Design profile area in m2")
    difference_m2: float = Field(description="Difference from design area")
    difference_percent: float = Field(description="Difference percentage")
    status: str = Field(description="Excavation status: over/under/normal")


class SegmentationMetrics(BaseModel):
    """Segmentation quality metrics."""
    confidence: float = Field(description="Detection confidence")
    mask_quality: Optional[str] = Field(default=None, description="Mask quality assessment")
    crack_confidence: Optional[float] = Field(default=None, description="Crack detection confidence")
    crack_count: Optional[int] = Field(default=None, description="Number of crack detections")
    crack_pixel_count: Optional[int] = Field(default=None, description="Crack mask pixel count")


class AnalysisResponse(BaseModel):
    """Analysis result response."""
    id: int
    status: str
    analysis_type: Optional[str] = None  # face_segmentation | crack_detection | full
    design_area_m2: Optional[float] = None
    scale_mm_per_pixel: Optional[float] = None
    original_image_url: Optional[str] = None
    mask_image_url: Optional[str] = None
    overlay_image_url: Optional[str] = None
    crack_mask_image_url: Optional[str] = None
    crack_overlay_image_url: Optional[str] = None
    combined_overlay_image_url: Optional[str] = None
    excavation: Optional[ExcavationResult] = None
    metrics: Optional[SegmentationMetrics] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AnalysisCreate(BaseModel):
    """Analysis creation response."""
    id: int
    status: str
    message: str


class AnalysisListItem(BaseModel):
    """Analysis list item."""
    id: int
    status: str
    excavation_status: Optional[str] = None
    actual_area_m2: Optional[float] = None
    difference_percent: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AnalysisList(BaseModel):
    """Paginated analysis list response."""
    items: List[AnalysisListItem]
    total: int
    page: int
    pages: int


class BatchAnalysisCreate(BaseModel):
    """Batch analysis creation response."""
    batch_id: str
    task_ids: List[int]
    total: int


class ProgressUpdate(BaseModel):
    """WebSocket progress update."""
    type: str = "progress"  # progress | result | error
    stage: str = Field(description="Current processing stage")
    progress: int = Field(description="Progress percentage 0-100")
    message: str = Field(description="Status message")


class StatsResponse(BaseModel):
    """Dashboard statistics response."""
    total_analyses: int
    today_analyses: int
    yesterday_analyses: int = Field(default=0, description="Number of analyses yesterday")
    today_vs_yesterday_percent: Optional[float] = Field(default=None, description="Today vs yesterday change %. None if yesterday=0")
    over_excavation_count: int
    under_excavation_count: int
    normal_count: int
    avg_difference_percent: float


class TrendDataPoint(BaseModel):
    """Single data point for trend chart."""
    id: int
    label: str  # e.g., "#1005" or "2026-01-02"
    over_excavation_area: float = Field(description="Over-excavation area in m²")
    under_excavation_area: float = Field(description="Under-excavation area in m²")
    difference_percent: Optional[float] = None
    created_at: datetime


class TrendResponse(BaseModel):
    """Trend data for dashboard chart."""
    labels: List[str]
    over_excavation_data: List[float]
    under_excavation_data: List[float]
    data_points: List[TrendDataPoint]


class DeviationDistribution(BaseModel):
    """Deviation distribution statistics."""
    severe_over_count: int = Field(description="Severe over-excavation (>15cm or >5%)")
    minor_over_count: int = Field(description="Minor over-excavation (5-15cm or 2-5%)")
    normal_count: int = Field(description="Within tolerance")
    minor_under_count: int = Field(description="Minor under-excavation")
    severe_under_count: int = Field(description="Severe under-excavation")


class SystemResourceStatus(BaseModel):
    """System resource usage."""
    cpu_percent: float
    memory_percent: float
    memory_used_gb: float
    memory_total_gb: float
    gpu_percent: Optional[float] = None
    gpu_memory_used_gb: Optional[float] = None
    gpu_memory_total_gb: Optional[float] = None
    gpu_available: bool = False


class ModelStatusItem(BaseModel):
    """Individual model status."""
    name: str
    version: str
    status: str  # online | standby | offline
    speed: Optional[str] = None
    loaded: bool = False


class SystemStatusResponse(BaseModel):
    """Full system status response."""
    resources: SystemResourceStatus
    models: List[ModelStatusItem]
    uptime_seconds: Optional[float] = None
