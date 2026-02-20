#!/usr/bin/env python3
"""Python ML worker for Go backend.

Reads one JSON request from stdin and writes line-delimited JSON messages to stdout:
- {"type": "progress", "data": {...}}
- {"type": "result", "data": {...}}
- {"type": "error", "data": {"message": "..."}}
"""

from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

from app.ml.pipeline import get_pipeline
from app.ml.crack_pipeline import get_crack_pipeline
from app.services.excavation import ExcavationAnalyzer
from app.config import settings


def emit(message_type: str, data: Dict[str, Any]) -> None:
    print(json.dumps({"type": message_type, "data": data}, ensure_ascii=False), flush=True)


def create_overlay(
    image: np.ndarray,
    mask: np.ndarray,
    alpha: float = 0.4,
    color: tuple = (38, 166, 154),
) -> np.ndarray:
    overlay = image.copy()
    mask_bool = mask.astype(bool)

    colored_mask = np.zeros_like(image)
    colored_mask[mask_bool] = color
    overlay = cv2.addWeighted(overlay, 1, colored_mask, alpha, 0)

    mask_uint8 = mask.astype(np.uint8)
    contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(overlay, contours, -1, color, 2)

    return overlay


def create_box_overlay(
    image: np.ndarray,
    boxes: List[List[int]],
    confidences: List[float],
    box_color: tuple = (239, 68, 68),
    thickness: int = 3,
    font_scale: float = 0.7,
) -> np.ndarray:
    overlay = image.copy()

    for i, box in enumerate(boxes):
        x1, y1, x2, y2 = box
        conf = confidences[i] if i < len(confidences) else 0.0

        cv2.rectangle(overlay, (x1, y1), (x2, y2), box_color, thickness)

        label = f"crack {conf:.0%}"
        (text_w, text_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, 2)

        label_y1 = max(0, y1 - text_h - 10)
        label_y2 = y1
        cv2.rectangle(overlay, (x1, label_y1), (x1 + text_w + 6, label_y2), box_color, -1)

        cv2.putText(
            overlay,
            label,
            (x1 + 3, y1 - 5),
            cv2.FONT_HERSHEY_SIMPLEX,
            font_scale,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

    return overlay


def create_multi_overlay(
    image: np.ndarray,
    face_mask: np.ndarray,
    crack_boxes: List[List[int]],
    crack_confidences: List[float],
    face_alpha: float = 0.35,
    face_color: tuple = (38, 166, 154),
    crack_color: tuple = (239, 68, 68),
) -> np.ndarray:
    overlay = image.copy()

    if np.any(face_mask):
        face_bool = face_mask.astype(bool)
        face_layer = np.zeros_like(image)
        face_layer[face_bool] = face_color
        overlay = cv2.addWeighted(overlay, 1, face_layer, face_alpha, 0)

        face_u8 = face_bool.astype(np.uint8)
        contours, _ = cv2.findContours(face_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(overlay, contours, -1, face_color, 2)

    if crack_boxes:
        overlay = create_box_overlay(
            overlay,
            crack_boxes,
            crack_confidences,
            box_color=crack_color,
        )

    return overlay


def run_analysis(request: Dict[str, Any]) -> Dict[str, Any]:
    analysis_id = int(request["analysis_id"])
    image_path = Path(request["image_path"])
    output_dir = Path(request["output_dir"])
    design_area_m2 = float(request["design_area_m2"])
    scale_mm_per_pixel = float(request["scale_mm_per_pixel"])
    analysis_type = str(request.get("analysis_type") or "full")

    do_face = analysis_type in ("face_segmentation", "full")
    do_crack = analysis_type in ("crack_detection", "full")

    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError(f"Failed to load image: {image_path}")
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    emit("progress", {"stage": "init", "progress": 5, "message": "Loading image..."})

    pipeline = get_pipeline()
    crack_pipeline = get_crack_pipeline()

    sam2_predictor = pipeline.sam2_predictor
    sam2_image_preloaded = False
    if sam2_predictor is not None:
        try:
            emit("progress", {"stage": "sam2_init", "progress": 8, "message": "Preparing SAM2 embeddings..."})
            sam2_predictor.set_image(image_rgb)
            sam2_image_preloaded = True
        except Exception:
            sam2_image_preloaded = False

    combined_mask = None
    seg_result = {"confidence": 0.0}

    if do_face:
        emit("progress", {"stage": "face_segmentation", "progress": 25, "message": "Running face segmentation..."})
        seg_result = pipeline.predict(
            image_rgb,
            use_sam2_refinement=True,
            sam2_image_preloaded=sam2_image_preloaded,
            require_sam2_output=settings.SAM2_STRICT_FACE_SEGMENTATION,
        )
        combined_mask = seg_result["combined_mask"]
        if not np.any(combined_mask):
            raise ValueError("未检测到有效掌子面区域，请检查图片清晰度/光照/拍摄角度后重试")
    else:
        combined_mask = np.ones((image_rgb.shape[0], image_rgb.shape[1]), dtype=bool)
        emit("progress", {"stage": "skip_face", "progress": 60, "message": "跳过掌子面分割，直接进行裂缝检测..."})

    output_dir.mkdir(parents=True, exist_ok=True)

    mask_path: Optional[Path] = None
    overlay_path: Optional[Path] = None

    pixel_count = None
    actual_area_m2 = None
    difference_m2 = None
    difference_percent = None
    excavation_status = None
    confidence = None

    if do_face:
        emit("progress", {"stage": "excavation", "progress": 72, "message": "Running excavation analysis..."})
        excavation = ExcavationAnalyzer(
            scale_mm_per_pixel=scale_mm_per_pixel,
            design_area_m2=design_area_m2,
            tolerance_percent=2.0,
        ).analyze(combined_mask)

        pixel_count = int(excavation.pixel_count)
        actual_area_m2 = float(excavation.actual_area_m2)
        difference_m2 = float(excavation.difference_m2)
        difference_percent = float(excavation.difference_percent)
        excavation_status = excavation.status.value
        confidence = float(seg_result.get("confidence", 0.0) or 0.0)

        mask_path = output_dir / f"{analysis_id}_mask.png"
        cv2.imwrite(str(mask_path), (combined_mask.astype(np.uint8) * 255))

        overlay_path = output_dir / f"{analysis_id}_overlay.png"
        overlay = create_overlay(image_rgb, combined_mask)
        cv2.imwrite(str(overlay_path), cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR))

    crack_mask_path: Optional[Path] = None
    crack_overlay_path: Optional[Path] = None
    combined_overlay_path: Optional[Path] = None
    crack_count = None
    crack_pixel_count = None
    crack_confidence = None

    if do_crack:
        emit("progress", {"stage": "crack_start", "progress": 80, "message": "Detecting and segmenting cracks..."})

        crack_mask = np.zeros_like(combined_mask, dtype=bool)
        crack_boxes: List[List[int]] = []
        crack_confidences: List[float] = []
        try:
            face_mask_for_crack = combined_mask if do_face else None
            crack_result = crack_pipeline.predict(
                image_rgb,
                face_mask=face_mask_for_crack,
            )
            crack_mask = crack_result.get("combined_mask", crack_mask)
            crack_boxes = crack_result.get("boxes", []) or []
            crack_confidences = crack_result.get("confidences", []) or []
            crack_count = int(crack_result.get("count", 0) or 0)
            crack_confidence = float(crack_result.get("confidence", 0.0) or 0.0)
        except Exception:
            crack_boxes = []
            crack_confidences = []
            crack_count = 0
            crack_confidence = 0.0

        crack_pixel_count = int(np.count_nonzero(crack_mask))

        crack_mask_path = output_dir / f"{analysis_id}_crack_mask.png"
        cv2.imwrite(str(crack_mask_path), (crack_mask.astype(np.uint8) * 255))

        crack_overlay_path = output_dir / f"{analysis_id}_crack_overlay.png"
        crack_overlay = create_box_overlay(image_rgb, crack_boxes, crack_confidences)
        cv2.imwrite(str(crack_overlay_path), cv2.cvtColor(crack_overlay, cv2.COLOR_RGB2BGR))

        if do_face:
            combined_overlay_path = output_dir / f"{analysis_id}_combined_overlay.png"
            combined_overlay = create_multi_overlay(image_rgb, combined_mask, crack_boxes, crack_confidences)
            cv2.imwrite(str(combined_overlay_path), cv2.cvtColor(combined_overlay, cv2.COLOR_RGB2BGR))

    emit("progress", {"stage": "post_processing", "progress": 98, "message": "Saving results..."})

    return {
        "mask_image_path": str(mask_path) if mask_path else None,
        "overlay_image_path": str(overlay_path) if overlay_path else None,
        "crack_mask_image_path": str(crack_mask_path) if crack_mask_path else None,
        "crack_overlay_image_path": str(crack_overlay_path) if crack_overlay_path else None,
        "combined_overlay_image_path": str(combined_overlay_path) if combined_overlay_path else None,
        "pixel_count": pixel_count,
        "actual_area_m2": actual_area_m2,
        "design_area_m2": design_area_m2 if do_face else None,
        "difference_m2": difference_m2,
        "difference_percent": difference_percent,
        "excavation_status": excavation_status,
        "confidence": confidence,
        "crack_count": crack_count,
        "crack_pixel_count": crack_pixel_count,
        "crack_confidence": crack_confidence,
    }


def main() -> int:
    raw = sys.stdin.readline()
    if not raw:
        emit("error", {"message": "No request payload provided"})
        return 1

    try:
        request = json.loads(raw)
        result = run_analysis(request)
        emit("result", result)
        return 0
    except Exception as exc:  # noqa: BLE001
        emit("error", {"message": str(exc)})
        print(traceback.format_exc(), file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
