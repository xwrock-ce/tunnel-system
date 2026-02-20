"""Crack Detection Pipeline.

This module encapsulates inference for crack detection using a YOLO model.
Outputs bounding boxes with confidence scores for detected cracks.
"""

from __future__ import annotations

from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

import cv2
import numpy as np
import torch

from app.config import settings


class CrackSegmentationPipeline:
    """Crack pipeline using YOLO detection (bounding box output)."""

    def __init__(
        self,
        yolo_weights: str,
        device: str = "cuda" if torch.cuda.is_available() else "cpu",
    ) -> None:
        self.device = device
        self._yolo_weights = yolo_weights
        self._yolo_model = None

    @property
    def yolo_model(self):
        """Lazy load YOLO model."""
        if self._yolo_model is None:
            weights_path = Path(self._yolo_weights)
            if not weights_path.exists():
                link_hint = ""
                if weights_path.is_symlink():
                    try:
                        link_hint = f" (symlink -> {weights_path.readlink()})"
                    except OSError:
                        link_hint = " (symlink)"
                raise FileNotFoundError(
                    f"Crack YOLO weights not found: {weights_path}{link_hint}. "
                    f"Please ensure `{settings.MODEL_WEIGHTS_DIR}` contains `{settings.CRACK_YOLO_WEIGHTS}`."
                )
            from ultralytics import YOLO

            self._yolo_model = YOLO(self._yolo_weights)
            print(f"[CrackPipeline] YOLO model loaded from {self._yolo_weights}")
        return self._yolo_model

    def _extract_boxes(
        self, yolo_results, image_shape: Tuple[int, int]
    ) -> Tuple[List[List[int]], List[float]]:
        """Extract boxes and confidences from YOLO results."""
        H, W = image_shape[:2]
        r = yolo_results[0]

        boxes_xyxy = (
            r.boxes.xyxy.detach().cpu().numpy()
            if getattr(r, "boxes", None) is not None
            else np.empty((0, 4))
        )
        confs = (
            r.boxes.conf.detach().cpu().numpy()
            if getattr(r, "boxes", None) is not None and getattr(r.boxes, "conf", None) is not None
            else np.empty((0,))
        )

        boxes: List[List[int]] = []
        confidences: List[float] = []
        for i, (x1, y1, x2, y2) in enumerate(boxes_xyxy):
            x1 = int(np.clip(x1, 0, W - 1))
            y1 = int(np.clip(y1, 0, H - 1))
            x2 = int(np.clip(x2, 0, W - 1))
            y2 = int(np.clip(y2, 0, H - 1))
            boxes.append([x1, y1, x2, y2])
            confidences.append(float(confs[i]) if i < len(confs) else 0.0)

        return boxes, confidences

    def predict(
        self,
        image: np.ndarray,
        face_mask: Optional[np.ndarray] = None,
        conf_threshold: float = 0.15,  # Lowered default for better detection
        iou_threshold: float = 0.5,
        max_det: int = 100,
        progress_callback: Optional[Callable[[str, int, str], None]] = None,
    ) -> Dict:
        """Run crack detection and return bounding boxes.

        Returns:
            Dict with keys:
                - boxes: List of [x1, y1, x2, y2] coordinates
                - confidences: List of confidence scores for each box
                - combined_mask: Simple mask from box regions (for compatibility)
                - confidence: Average confidence
                - count: Number of detected cracks
        """
        H, W = image.shape[:2]

        if progress_callback:
            progress_callback("crack_detection", 10, "Running crack detection...")

        yolo_results = self.yolo_model.predict(
            image,
            conf=conf_threshold,
            iou=iou_threshold,
            max_det=max_det,
            verbose=False,
        )
        boxes, confidences = self._extract_boxes(yolo_results, (H, W))

        if progress_callback:
            progress_callback("crack_detection", 50, f"Detected {len(boxes)} crack regions")

        # Filter boxes by overlap with face mask if provided
        if face_mask is not None and len(boxes) > 0:
            filtered_boxes: List[List[int]] = []
            filtered_confs: List[float] = []
            for i, box in enumerate(boxes):
                x1, y1, x2, y2 = box
                roi = face_mask[y1:y2, x1:x2]
                if roi.size == 0:
                    continue
                overlap = float(np.count_nonzero(roi)) / float(roi.size)
                if overlap < 0.05:
                    continue
                filtered_boxes.append(box)
                filtered_confs.append(confidences[i] if i < len(confidences) else 0.0)
            boxes, confidences = filtered_boxes, filtered_confs

        if progress_callback:
            progress_callback("crack_detection", 80, f"Filtered to {len(boxes)} cracks")

        # Create a simple combined mask from box regions (for compatibility)
        combined_mask = np.zeros((H, W), dtype=bool)
        for box in boxes:
            x1, y1, x2, y2 = box
            combined_mask[y1:y2, x1:x2] = True

        if progress_callback:
            progress_callback("crack_completed", 100, "Crack detection complete")

        avg_conf = float(np.mean(confidences)) if confidences else 0.0
        return {
            "boxes": boxes,
            "confidences": confidences,
            "combined_mask": combined_mask,
            "confidence": avg_conf,
            "count": len(boxes),
        }


_crack_pipeline_instance: Optional[CrackSegmentationPipeline] = None


def get_crack_pipeline() -> CrackSegmentationPipeline:
    """Get or create singleton crack pipeline."""
    global _crack_pipeline_instance
    if _crack_pipeline_instance is None:
        weights_dir = settings.MODEL_WEIGHTS_DIR
        _crack_pipeline_instance = CrackSegmentationPipeline(
            yolo_weights=str(weights_dir / settings.CRACK_YOLO_WEIGHTS),
        )
    return _crack_pipeline_instance

