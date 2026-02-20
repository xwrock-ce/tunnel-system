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
        candidates.append(Path(env_path).expanduser())

    home = Path.home()
    candidates.extend([
        home / "Desktop" / "yolov11" / "sam2",
        home / "Pictures" / "yolov11" / "sam2",
        home / "yolov11" / "sam2",
        settings.BASE_DIR / "yolov11" / "sam2",
        settings.BASE_DIR.parent / "yolov11" / "sam2",
        settings.BASE_DIR.parent.parent / "yolov11" / "sam2",
        Path("/app/yolov11/sam2"),
        Path("/yolov11/sam2"),
    ])

    seen = set()
    for candidate in candidates:
        if not candidate:
            continue
        candidate = candidate.expanduser()
        candidate_str = str(candidate)
        if candidate_str in seen:
            continue
        seen.add(candidate_str)
        if not candidate.exists():
            continue

        # The repo root should contain "sam2/" package; if we get the package dir
        # directly, add its parent to sys.path.
        if (candidate / "sam2").is_dir():
            path_to_add = candidate_str
        elif candidate.name == "sam2" and (candidate / "__init__.py").exists():
            path_to_add = str(candidate.parent)
        else:
            continue

        if path_to_add not in sys.path:
            sys.path.insert(0, path_to_add)

        try:
            import sam2  # noqa: F401
            return
        except ModuleNotFoundError as e:
            # If "sam2" itself is still missing, continue searching next path.
            if e.name == "sam2":
                continue
            # Dependency missing (e.g., hydra/iopath): path is valid, stop searching.
            return
        except Exception:
            # Path is likely valid; let predictor initialization report concrete error.
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
        self._sam2_init_error: Optional[str] = None

        # Store paths for lazy loading
        self._yolo_weights = yolo_weights
        self._sam2_config = sam2_config
        self._sam2_base_checkpoint = sam2_base_checkpoint
        self._sam2_finetuned_checkpoint = sam2_finetuned_checkpoint

    @staticmethod
    def _normalize_sam2_config_name(config_value: str) -> str:
        """Convert filesystem-like config paths to SAM2 Hydra config names."""
        raw = str(config_value or "").strip()
        if not raw:
            return raw

        cfg = raw.replace("\\", "/")
        while cfg.startswith("./"):
            cfg = cfg[2:]
        if cfg.startswith("pkg://"):
            cfg = cfg[len("pkg://"):]
        if cfg.startswith("sam2/"):
            cfg = cfg[len("sam2/"):]
        if cfg.startswith("sam2_configs/"):
            return "configs/" + cfg[len("sam2_configs/"):]
        if cfg.startswith("configs/"):
            return cfg

        markers = ["/sam2/configs/", "/sam2_configs/", "/configs/"]
        for marker in markers:
            idx = cfg.find(marker)
            if idx >= 0:
                tail = cfg[idx + len(marker):]
                return f"configs/{tail}"

        return cfg

    def _resolve_sam2_config_name(self) -> str:
        """Resolve user config input to a Hydra config name under SAM2 package."""
        cfg_name = self._normalize_sam2_config_name(self._sam2_config)

        import sam2

        sam2_pkg = Path(sam2.__file__).resolve().parent
        candidate = sam2_pkg / cfg_name
        if candidate.exists():
            return cfg_name

        # Fallback: try locating by filename inside SAM2 configs.
        configs_root = sam2_pkg / "configs"
        basename = Path(cfg_name).name
        matches = list(configs_root.rglob(basename)) if configs_root.exists() else []
        if len(matches) == 1:
            return str(matches[0].relative_to(sam2_pkg)).replace("\\", "/")

        raw = str(self._sam2_config)
        raise FileNotFoundError(
            "SAM2 config resolution failed. "
            f"raw=`{raw}`, normalized=`{cfg_name}`. "
            f"Expected a config under `{configs_root}` "
            "(e.g. `configs/sam2.1/sam2.1_hiera_b+.yaml`)."
        )

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

                base_ckpt_path = Path(self._sam2_base_checkpoint)
                if not base_ckpt_path.exists():
                    print("[Pipeline] SAM2 skipped: missing checkpoint files")
                    self._sam2_predictor = None
                    self._sam2_init_error = f"SAM2 checkpoint not found: {base_ckpt_path}"
                    return self._sam2_predictor

                config_name = self._resolve_sam2_config_name()

                # Build base model
                sam2_model = build_sam2(
                    config_name,
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
                self._sam2_init_error = None
            except Exception as e:
                print(f"[Pipeline] SAM2 not available: {e}")
                self._sam2_predictor = None
                self._sam2_init_error = str(e)
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
            # Reverse letterbox padding before resizing back to original image.
            scale = min(w_m / max(W, 1), h_m / max(H, 1))
            new_w = max(int(round(W * scale)), 1)
            new_h = max(int(round(H * scale)), 1)
            dw, dh = (w_m - new_w) / 2.0, (h_m - new_h) / 2.0
            x1_pad, y1_pad = int(round(dw)), int(round(dh))
            x2_pad, y2_pad = min(x1_pad + new_w, w_m), min(y1_pad + new_h, h_m)
            for d in data:
                d_crop = d[y1_pad:y2_pad, x1_pad:x2_pad]
                if d_crop.size == 0:
                    d_crop = d
                d_full = cv2.resize(d_crop, (W, H), interpolation=cv2.INTER_NEAREST)
                masks_out.append(d_full > 0.5)

        return boxes, masks_out

    def _get_sam2_mask_input_size(self) -> Tuple[int, int]:
        """Read SAM2 prompt-encoder mask input size, fallback to 256x256."""
        predictor = self.sam2_predictor
        if predictor is None:
            return 256, 256

        prompt_encoder = getattr(getattr(predictor, "model", None), "sam_prompt_encoder", None)
        mask_input_size = getattr(prompt_encoder, "mask_input_size", None)
        if mask_input_size is None:
            return 256, 256

        try:
            h, w = int(mask_input_size[0]), int(mask_input_size[1])
            if h > 0 and w > 0:
                return h, w
        except Exception:
            pass

        return 256, 256

    def _refine_with_sam2(
        self,
        yolo_mask: np.ndarray,
        box: List[int]
    ) -> Tuple[np.ndarray, bool]:
        """
        Refine YOLO mask using SAM2.

        Args:
            yolo_mask: YOLO segmentation mask
            box: Bounding box [x1, y1, x2, y2]

        Returns:
            Tuple of (mask, used_sam2)
        """
        predictor = self.sam2_predictor
        if predictor is None:
            return yolo_mask.astype(bool), False

        try:
            mask_h, mask_w = self._get_sam2_mask_input_size()

            # Prepare mask prompt (1, H, W), normalized to [0, 1].
            mask_prompt = yolo_mask.astype(np.float32)
            if mask_prompt.max() > 1.0:
                mask_prompt = mask_prompt / 255.0
            mask_resized = cv2.resize(
                mask_prompt,
                (mask_w, mask_h),
                interpolation=cv2.INTER_NEAREST
            )
            mask_input = mask_resized[np.newaxis, :, :]

            # Prepare box prompt as explicit batch dimension (1, 4).
            box_array = np.asarray(box, dtype=np.float32).reshape(1, 4)

            # Run SAM2 prediction
            masks, scores, _ = predictor.predict(
                point_coords=None,
                point_labels=None,
                mask_input=mask_input,
                box=box_array,
                multimask_output=True
            )

            # Pick highest-scoring SAM2 candidate as final mask.
            if len(masks) > 0:
                best_idx = int(np.argmax(scores)) if scores is not None and len(scores) > 0 else 0
                out = masks[best_idx]
                if out.shape[:2] != yolo_mask.shape[:2]:
                    out_resized = cv2.resize(
                        out.astype(np.float32),
                        (yolo_mask.shape[1], yolo_mask.shape[0]),
                        interpolation=cv2.INTER_NEAREST
                    )
                    out = out_resized
                return (out > 0.5).astype(bool), True
            print("[Pipeline] SAM2 returned empty masks, fallback to YOLO mask")
        except Exception as e:
            print(f"[Pipeline] SAM2 refinement failed: {e}")

        return yolo_mask.astype(bool), False

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
        require_sam2_output: bool = False,
        progress_callback: Optional[Callable[[str, int, str], None]] = None
    ) -> Dict:
        """
        Run full segmentation pipeline on an image.

        Args:
            image: RGB image array (H, W, 3)
            use_sam2_refinement: Whether to use SAM2 for mask refinement
            sam2_image_preloaded: If True, assumes `sam2_predictor.set_image(image)` was already called.
            require_sam2_output: If True, fail when final mask is not fully produced by SAM2.
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
        output_boxes = boxes
        prompt_boxes = boxes
        prompt_masks = yolo_masks

        if use_sam2_refinement and boxes and not yolo_masks and require_sam2_output:
            raise RuntimeError(
                "SAM2 strict mode enabled for face segmentation, "
                "but YOLO returned boxes without segmentation masks. "
                "Please use YOLOv11-seg weights (segment model), not detection-only weights."
            )

        if use_sam2_refinement and boxes and yolo_masks and len(boxes) != len(yolo_masks):
            mismatch_msg = (
                f"YOLO returned mismatched prompts: {len(boxes)} boxes vs {len(yolo_masks)} masks"
            )
            print(f"[Pipeline] {mismatch_msg}")
            if require_sam2_output:
                raise RuntimeError(
                    "SAM2 strict mode enabled for face segmentation, "
                    f"but {mismatch_msg}"
                )
            pair_count = min(len(boxes), len(yolo_masks))
            prompt_boxes = boxes[:pair_count]
            prompt_masks = yolo_masks[:pair_count]
            output_boxes = prompt_boxes

        if progress_callback:
            progress_callback("yolo_detection", 30, f"Detected {len(output_boxes)} regions")

        # Get confidence scores
        confidences = []
        if yolo_results[0].boxes is not None:
            conf_tensor = yolo_results[0].boxes.conf
            if conf_tensor is not None:
                confidences = conf_tensor.cpu().numpy().tolist()
        if output_boxes and len(confidences) > len(output_boxes):
            confidences = confidences[:len(output_boxes)]

        # Stage 2: SAM2 Refinement (if enabled and available)
        refined_masks = []
        sam2_refined_count = 0
        final_mask_source = "yolo"
        sam2_predictor = self.sam2_predictor if use_sam2_refinement else None

        if require_sam2_output and not use_sam2_refinement:
            raise ValueError("SAM2 strict mode enabled, but use_sam2_refinement=False")
        if require_sam2_output and sam2_predictor is None:
            detail = f" Root cause: {self._sam2_init_error}" if self._sam2_init_error else ""
            raise RuntimeError(
                "SAM2 strict mode enabled for face segmentation, "
                "but SAM2 predictor is unavailable. "
                "Please install SAM2 dependencies and check SAM2 paths."
                f"{detail}"
            )

        if use_sam2_refinement and sam2_predictor is not None and prompt_masks:
            if progress_callback:
                progress_callback("sam2_segmentation", 40, "Refining masks with SAM2...")

            if not sam2_image_preloaded:
                sam2_predictor.set_image(image)

            for i, (mask, box) in enumerate(zip(prompt_masks, prompt_boxes)):
                refined, used_sam2 = self._refine_with_sam2(mask, box)
                refined_masks.append(refined)
                if used_sam2:
                    sam2_refined_count += 1

                if progress_callback:
                    prog = 40 + int((i + 1) / len(prompt_masks) * 40)
                    progress_callback("sam2_segmentation", prog, f"Refined mask {i+1}/{len(prompt_masks)}")

            if sam2_refined_count == len(prompt_masks):
                final_mask_source = "sam2"
            elif sam2_refined_count > 0:
                final_mask_source = "sam2_with_yolo_fallback"
            else:
                final_mask_source = "yolo_fallback"
        else:
            refined_masks = prompt_masks

        if require_sam2_output and prompt_masks and sam2_refined_count < len(prompt_masks):
            raise RuntimeError(
                "SAM2 strict mode enabled for face segmentation, "
                f"but only {sam2_refined_count}/{len(prompt_masks)} masks were refined by SAM2"
            )

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
            "boxes": output_boxes,
            "masks": refined_masks,
            "combined_mask": combined_mask,
            "confidence": np.mean(confidences) if confidences else 0.0,
            # Trace fields for debugging prompt/segmentation path.
            "sam2_prompt_mode": "yolo_box_and_mask" if use_sam2_refinement else None,
            "sam2_refined_count": sam2_refined_count,
            "final_mask_source": final_mask_source,
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
            sam2_config=str(settings.SAM2_CONFIG),
            sam2_base_checkpoint=str(weights_dir / settings.SAM2_BASE_CHECKPOINT),
            sam2_finetuned_checkpoint=str(weights_dir / settings.SAM2_FINETUNED_CHECKPOINT),
        )

    return _pipeline_instance
