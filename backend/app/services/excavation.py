"""Tunnel Over/Under Excavation Analysis Service.

This module calculates excavation status by comparing actual tunnel face area
with the design profile area.
"""
from dataclasses import dataclass
from enum import Enum
from typing import Optional
import numpy as np

from app.config import settings


class ExcavationStatus(str, Enum):
    """Excavation status enumeration."""
    OVER = "over_excavation"      # 超挖: actual > design
    UNDER = "under_excavation"    # 欠挖: actual < design
    NORMAL = "within_tolerance"   # 正常: within tolerance


@dataclass
class ExcavationResult:
    """Excavation analysis result."""
    pixel_count: int
    actual_area_m2: float
    design_area_m2: float
    difference_m2: float
    difference_percent: float
    status: ExcavationStatus

    def to_dict(self) -> dict:
        """Convert to dictionary for API response."""
        return {
            "pixel_count": self.pixel_count,
            "actual_area_m2": round(self.actual_area_m2, 2),
            "design_area_m2": round(self.design_area_m2, 2),
            "difference_m2": round(self.difference_m2, 2),
            "difference_percent": round(self.difference_percent, 2),
            "status": self.status.value
        }


class ExcavationAnalyzer:
    """Tunnel excavation analyzer.

    Converts pixel count to actual area and determines over/under excavation status.

    Formula:
        area_m2 = pixel_count * (scale_mm_per_pixel / 1000)^2
        difference_percent = (actual_area - design_area) / design_area * 100
    """

    def __init__(
        self,
        scale_mm_per_pixel: float = None,
        design_area_m2: float = None,
        tolerance_percent: float = 2.0
    ):
        """
        Initialize the excavation analyzer.

        Args:
            scale_mm_per_pixel: Linear scale (mm per pixel). Default from settings.
            design_area_m2: Design profile area in m². Default from settings.
            tolerance_percent: Percentage tolerance for "normal" status.
        """
        self.scale = scale_mm_per_pixel or settings.SCALE_MM_PER_PIXEL
        self.design_area = design_area_m2 or settings.DESIGN_AREA_M2
        self.tolerance = tolerance_percent

        # Area per pixel in m²: (mm/pixel)² -> m²
        self.area_per_pixel = (self.scale / 1000) ** 2

    def analyze(self, mask: np.ndarray) -> ExcavationResult:
        """
        Analyze excavation from a binary mask.

        Args:
            mask: Binary mask array (H, W) where True/1 = excavated area

        Returns:
            ExcavationResult with area calculations and status
        """
        # Count white (foreground) pixels
        pixel_count = int(np.sum(mask > 0))

        # Calculate actual area in m²
        actual_area = pixel_count * self.area_per_pixel

        # Calculate difference from design
        difference = actual_area - self.design_area
        difference_pct = (difference / self.design_area) * 100 if self.design_area > 0 else 0.0

        # Determine status based on tolerance
        if abs(difference_pct) <= self.tolerance:
            status = ExcavationStatus.NORMAL
        elif difference_pct > 0:
            status = ExcavationStatus.OVER
        else:
            status = ExcavationStatus.UNDER

        return ExcavationResult(
            pixel_count=pixel_count,
            actual_area_m2=actual_area,
            design_area_m2=self.design_area,
            difference_m2=difference,
            difference_percent=difference_pct,
            status=status
        )

    def analyze_from_pixel_count(self, pixel_count: int) -> ExcavationResult:
        """
        Analyze excavation from pixel count directly.

        Args:
            pixel_count: Number of foreground pixels

        Returns:
            ExcavationResult
        """
        # Create a dummy mask with the given pixel count
        dummy = np.ones(pixel_count, dtype=bool)
        return self.analyze(dummy.reshape(-1))
