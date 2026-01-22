"""Database models using SQLAlchemy."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import enum

Base = declarative_base()


class ExcavationStatus(str, enum.Enum):
    """Excavation status enumeration."""
    OVER = "over_excavation"      # 超挖
    UNDER = "under_excavation"    # 欠挖
    NORMAL = "within_tolerance"   # 正常范围


class AnalysisStatus(str, enum.Enum):
    """Analysis task status."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class AnalysisType(str, enum.Enum):
    """Analysis type enumeration."""
    FACE_SEGMENTATION = "face_segmentation"  # 仅掌子面分割
    CRACK_DETECTION = "crack_detection"      # 仅裂缝检测
    FULL = "full"                            # 完整分析（两者都做）


class User(Base):
    """User model for authentication."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    password_hash = Column(String(128), nullable=False)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

    analyses = relationship("Analysis", back_populates="user")


class Analysis(Base):
    """Analysis record model."""
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Analysis type
    analysis_type = Column(String(20), default=AnalysisType.FULL.value)

    # File paths
    original_image = Column(String(255), nullable=False)
    mask_image = Column(String(255), nullable=True)
    overlay_image = Column(String(255), nullable=True)
    crack_mask_image = Column(String(255), nullable=True)
    crack_overlay_image = Column(String(255), nullable=True)
    combined_overlay_image = Column(String(255), nullable=True)

    # Analysis results
    status = Column(String(20), default=AnalysisStatus.PENDING.value)
    pixel_count = Column(Integer, nullable=True)
    actual_area_m2 = Column(Float, nullable=True)
    design_area_m2 = Column(Float, nullable=True)
    scale_mm_per_pixel = Column(Float, nullable=True)
    difference_m2 = Column(Float, nullable=True)
    difference_percent = Column(Float, nullable=True)
    excavation_status = Column(String(20), nullable=True)

    # Segmentation metrics
    confidence = Column(Float, nullable=True)
    iou = Column(Float, nullable=True)
    crack_count = Column(Integer, nullable=True)
    crack_pixel_count = Column(Integer, nullable=True)
    crack_confidence = Column(Float, nullable=True)

    # Error message if failed
    error_message = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="analyses")
