"""YOLO + SAM2 Tunnel Segmentation Pipeline.

This module encapsulates the inference pipeline for tunnel face segmentation,
combining YOLOv11 detection with SAM2 mask refinement.
"""
import os
import sys
import numpy as np
import cv2
import torch
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Callable

from app.config import settings

def _maybe_add_sam2_to_path() -> None:
    """Make `import sam2` work in dev/docker without hard-coded absolute paths."""
    try:
        import sam2  # noqa: F401
        return
    except Exception:
        pass

    candidates: List[Path] = []
    env_path = os.environ.get("SAM2_REPO_PATH")
    if env_path:
        candidates.append(Path(env_path))

    candidates.extend([
        settings.BASE_DIR / "yolov11" / "sam2",
        settings.BASE_DIR.parent / "yolov11" / "sam2",
        Path("/app/yolov11/sam2"),
        Path("/yolov11/sam2"),
    ])

    for candidate in candidates:
        if not candidate:
            continue
        if not candidate.exists():
            continue
        candidate_str = str(candidate)
        if candidate_str not in sys.path:
            sys.path.insert(0, candidate_str)
        return


_maybe_add_sam2_to_path()


class TunnelSegmentationPipeline:
    """Tunnel face segmentation pipeline using YOLO + SAM2."""

    def __init__(
        self,
        yolo_weights: str,
        sam2_config: str,
        sam2_base_checkpoint: str,
        sam2_finetuned_checkpoint: Optional[str] = None,
        device: str = "cuda" if torch.cuda.is_available() else "cpu"
    ):
        """
        Initialize the segmentation pipeline.

        Args:
            yolo_weights: Path to YOLO model weights
            sam2_config: Path to SAM2 config file
            sam2_base_checkpoint: Path to SAM2 base model checkpoint
            sam2_finetuned_checkpoint: Optional path to fine-tuned SAM2 checkpoint
            device: Device to run inference on
        """
        self.device = device
        self._yolo_model = None
        self._sam2_predictor = None

        # Store paths for lazy loading
        self._yolo_weights = yolo_weights
        self._sam2_config = sam2_config
        self._sam2_base_checkpoint = sam2_base_checkpoint
        self._sam2_finetuned_checkpoint = sam2_finetuned_checkpoint

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
                    f"YOLO weights not found: {weights_path}{link_hint}. "
                    f"Please ensure `{settings.MODEL_WEIGHTS_DIR}` contains `{settings.YOLO_WEIGHTS}`."
                )
            from ultralytics import YOLO
            self._yolo_model = YOLO(self._yolo_weights)
            print(f"[Pipeline] YOLO model loaded from {self._yolo_weights}")
        return self._yolo_model

    @property
    def sam2_predictor(self):
        """Lazy load SAM2 predictor."""
        if self._sam2_predictor is None:
            try:
                from sam2.build_sam import build_sam2
                from sam2.sam2_image_predictor import SAM2ImagePredictor

                config_path = Path(self._sam2_config)
                base_ckpt_path = Path(self._sam2_base_checkpoint)
                if not config_path.exists() or not base_ckpt_path.exists():
                    print("[Pipeline] SAM2 skipped: missing config/checkpoint files")
                    self._sam2_predictor = None
                    return self._sam2_predictor

                # Build base model
                sam2_model = build_sam2(
                    self._sam2_config,
                    self._sam2_base_checkpoint,
                    device=self.device
                )

                # Load fine-tuned weights if available
                if self._sam2_finetuned_checkpoint and Path(self._sam2_finetuned_checkpoint).exists():
                    checkpoint = torch.load(
                        self._sam2_finetuned_checkpoint,
                        map_location=self.device
                    )
                    model_state = checkpoint.get('model', checkpoint)
                    sam2_model.load_state_dict(model_state, strict=False)
                    print(f"[Pipeline] SAM2 fine-tuned model loaded from {self._sam2_finetuned_checkpoint}")
                else:
                    print(f"[Pipeline] SAM2 base model loaded from {self._sam2_base_checkpoint}")

                self._sam2_predictor = SAM2ImagePredictor(sam2_model)
            except ImportError as e:
                print(f"[Pipeline] SAM2 not available: {e}")
                self._sam2_predictor = None
        return self._sam2_predictor

    def _extract_yolo_outputs(
        self,
        yolo_results,
        image_shape: Tuple[int, int]
    ) -> Tuple[List[List[int]], List[np.ndarray]]:
        """
        Extract boxes and masks from YOLO results at original image scale.

        Args:
            yolo_results: YOLO inference results
            image_shape: (H, W) of original image

        Returns:
            Tuple of (boxes, masks) where boxes are [x1,y1,x2,y2] and masks are boolean arrays
        """
        H, W = image_shape[:2]
        r = yolo_results[0]

        # Extract boxes (usually already in original image coordinates)
        boxes_xyxy = r.boxes.xyxy.detach().cpu().numpy() if getattr(r, "boxes", None) is not None else np.empty((0, 4))
        boxes = []
        for x1, y1, x2, y2 in boxes_xyxy:
            x1 = int(np.clip(x1, 0, W - 1))
            y1 = int(np.clip(y1, 0, H - 1))
            x2 = int(np.clip(x2, 0, W - 1))
            y2 = int(np.clip(y2, 0, H - 1))
            boxes.append([x1, y1, x2, y2])

        masks_out = []
        m = getattr(r, "masks", None)
        if m is None:
            return boxes, masks_out

        # Prefer polygon-based rasterization for better accuracy
        xy = getattr(m, "xy", None)
        if xy is not None and len(xy) > 0:
            for poly in xy:
                poly_list = [poly] if isinstance(poly, np.ndarray) else list(poly)
                mask = np.zeros((H, W), dtype=np.uint8)
                polys = []
                for p in poly_list:
                    if p is None or len(p) == 0:
                        continue
                    pts = np.rint(p).astype(np.int32)
                    pts[:, 0] = np.clip(pts[:, 0], 0, W - 1)
                    pts[:, 1] = np.clip(pts[:, 1], 0, H - 1)
                    polys.append(pts)
                if polys:
                    cv2.fillPoly(mask, polys, 1)
                    masks_out.append(mask.astype(bool))
            return boxes, masks_out

        # Fallback: resize from model output
        data = m.data.detach().cpu().numpy()
        h_m, w_m = data.shape[-2:]
        if (h_m, w_m) == (H, W):
            masks_out = [(d > 0.5) for d in data]
        else:
            for d in data:
                d_resized = cv2.resize(d, (W, H), interpolation=cv2.INTER_NEAREST)
                masks_out.append(d_resized > 0.5)

        return boxes, masks_out

    def _refine_with_sam2(
        self,
        yolo_mask: np.ndarray,
        box: List[int]
    ) -> np.ndarray:
        """
        Refine YOLO mask using SAM2.

        Args:
            yolo_mask: YOLO segmentation mask
            box: Bounding box [x1, y1, x2, y2]

        Returns:
            Refined binary mask
        """
        if self.sam2_predictor is None:
            return yolo_mask

        try:
            # Prepare mask input (resize to 256x256 for SAM2)
            mask_resized = cv2.resize(
                yolo_mask.astype(np.float32),
                (256, 256),
                interpolation=cv2.INTER_NEAREST
            )
            mask_input = mask_resized[np.newaxis, :, :]

            # Prepare box input
            box_array = np.array(box)

            # Run SAM2 prediction
            masks, scores, _ = self.sam2_predictor.predict(
                mask_input=mask_input,
                box=box_array,
                multimask_output=False
            )

            # Get the best mask
            if len(masks) > 0:
                out = masks[0]
                if out.shape[:2] != yolo_mask.shape[:2]:
                    out_resized = cv2.resize(
                        out.astype(np.float32),
                        (yolo_mask.shape[1], yolo_mask.shape[0]),
                        interpolation=cv2.INTER_NEAREST
                    )
                    out = out_resized > 0.5
                return out.astype(bool)
        except Exception as e:
            print(f"[Pipeline] SAM2 refinement failed: {e}")

            return yolo_mask

    def _union_masks(self, masks: List[np.ndarray], shape: Tuple[int, int]) -> np.ndarray:
        """Combine multiple masks into a single union mask."""
        if not masks:
            return np.zeros(shape, dtype=bool)
        stacked = np.stack([m.astype(bool) for m in masks], axis=0)
        return np.any(stacked, axis=0)

    def predict(
        self,
        image: np.ndarray,
        use_sam2_refinement: bool = True,
        sam2_image_preloaded: bool = False,
        progress_callback: Optional[Callable[[str, int, str], None]] = None
    ) -> Dict:
        """
        Run full segmentation pipeline on an image.

        Args:
            image: RGB image array (H, W, 3)
            use_sam2_refinement: Whether to use SAM2 for mask refinement
            sam2_image_preloaded: If True, assumes `sam2_predictor.set_image(image)` was already called.
            progress_callback: Optional callback(stage, progress, message)

        Returns:
            Dict with keys:
                - boxes: List of bounding boxes
                - masks: List of individual masks
                - combined_mask: Union of all masks
                - confidence: Average detection confidence
        """
        H, W = image.shape[:2]

        # Stage 1: YOLO Detection
        if progress_callback:
            progress_callback("yolo_detection", 10, "Running YOLO detection...")

        yolo_results = self.yolo_model(image)
        boxes, yolo_masks = self._extract_yolo_outputs(yolo_results, (H, W))

        if progress_callback:
            progress_callback("yolo_detection", 30, f"Detected {len(boxes)} regions")

        # Get confidence scores
        confidences = []
        if yolo_results[0].boxes is not None:
            conf_tensor = yolo_results[0].boxes.conf
            if conf_tensor is not None:
                confidences = conf_tensor.cpu().numpy().tolist()

        # Stage 2: SAM2 Refinement (if enabled and available)
        refined_masks = []
        if use_sam2_refinement and self.sam2_predictor is not None and yolo_masks:
            if progress_callback:
                progress_callback("sam2_segmentation", 40, "Refining masks with SAM2...")

            if not sam2_image_preloaded:
                self.sam2_predictor.set_image(image)

            for i, (mask, box) in enumerate(zip(yolo_masks, boxes)):
                refined = self._refine_with_sam2(mask, box)
                refined_masks.append(refined)

                if progress_callback:
                    prog = 40 + int((i + 1) / len(yolo_masks) * 40)
                    progress_callback("sam2_segmentation", prog, f"Refined mask {i+1}/{len(yolo_masks)}")
        else:
            refined_masks = yolo_masks

        # Stage 3: Post-processing
        if progress_callback:
            progress_callback("post_processing", 85, "Combining masks...")

        combined_mask = self._union_masks(refined_masks, (H, W))

        # Apply morphological operations for smoother boundaries
        if np.any(combined_mask):
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            combined_uint8 = combined_mask.astype(np.uint8)
            combined_uint8 = cv2.morphologyEx(combined_uint8, cv2.MORPH_CLOSE, kernel)
            combined_mask = combined_uint8.astype(bool)

        if progress_callback:
            progress_callback("completed", 100, "Segmentation complete")

        return {
            "boxes": boxes,
            "masks": refined_masks,
            "combined_mask": combined_mask,
            "confidence": np.mean(confidences) if confidences else 0.0
        }


# Singleton pipeline instance
_pipeline_instance: Optional[TunnelSegmentationPipeline] = None


def get_pipeline() -> TunnelSegmentationPipeline:
    """Get or create the singleton pipeline instance."""
    global _pipeline_instance

    if _pipeline_instance is None:
        weights_dir = settings.MODEL_WEIGHTS_DIR

        _pipeline_instance = TunnelSegmentationPipeline(
            yolo_weights=str(weights_dir / settings.YOLO_WEIGHTS),
            sam2_config=str(weights_dir / settings.SAM2_CONFIG),
            sam2_base_checkpoint=str(weights_dir / settings.SAM2_BASE_CHECKPOINT),
            sam2_finetuned_checkpoint=str(weights_dir / settings.SAM2_FINETUNED_CHECKPOINT),
        )

    return _pipeline_instance
