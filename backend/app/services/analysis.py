"""Analysis Service - Orchestrates the full analysis pipeline."""
from datetime import datetime
from pathlib import Path
from typing import Optional, Callable, Dict, Any
import cv2
import numpy as np

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.config import settings
from app.models.database import Analysis, AnalysisStatus, AnalysisType
from app.ml.pipeline import get_pipeline
from app.ml.crack_pipeline import get_crack_pipeline
from app.services.excavation import ExcavationAnalyzer


class AnalysisService:
    """Service for managing analysis tasks."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.pipeline = get_pipeline()
        self.crack_pipeline = get_crack_pipeline()

    async def create_analysis(
        self,
        user_id: int,
        image_path: str,
        design_area: Optional[float] = None,
        scale: Optional[float] = None,
        analysis_type: str = "full"
    ) -> Analysis:
        """
        Create a new analysis record.

        Args:
            user_id: User ID
            image_path: Path to uploaded image
            design_area: Optional custom design area
            scale: Optional custom scale
            analysis_type: Type of analysis (face_segmentation, crack_detection, full)

        Returns:
            Created Analysis record
        """
        analysis = Analysis(
            user_id=user_id,
            original_image=image_path,
            status=AnalysisStatus.PENDING.value,
            design_area_m2=design_area or settings.DESIGN_AREA_M2,
            scale_mm_per_pixel=scale or settings.SCALE_MM_PER_PIXEL,
            analysis_type=analysis_type,
        )
        self.db.add(analysis)
        await self.db.commit()
        await self.db.refresh(analysis)
        return analysis

    async def run_analysis(
        self,
        analysis_id: int,
        progress_callback: Optional[Callable[[str, int, str], None]] = None
    ) -> Analysis:
        """
        Run the full analysis pipeline.

        Args:
            analysis_id: Analysis record ID
            progress_callback: Optional progress callback

        Returns:
            Updated Analysis record
        """
        # Get analysis record
        result = await self.db.execute(
            select(Analysis).where(Analysis.id == analysis_id)
        )
        analysis = result.scalar_one_or_none()

        if not analysis:
            raise ValueError(f"Analysis {analysis_id} not found")

        try:
            # Update status to processing
            analysis.status = AnalysisStatus.PROCESSING.value
            await self.db.commit()

            # Load image
            image_path = Path(analysis.original_image)
            if not image_path.exists():
                raise FileNotFoundError(f"Image not found: {image_path}")

            image = cv2.imread(str(image_path))
            if image is None:
                raise ValueError(f"Failed to load image: {image_path}")

            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            def make_scaled_callback(base: int, span: int):
                def _cb(stage: str, progress: int, message: str):
                    if not progress_callback:
                        return
                    overall = base + int((progress / 100) * span)
                    overall = max(0, min(100, overall))
                    progress_callback(stage, overall, message)

                return _cb

            if progress_callback:
                progress_callback("init", 5, "Loading image...")

            # Get analysis type
            analysis_type = analysis.analysis_type or AnalysisType.FULL.value
            do_face_segmentation = analysis_type in [AnalysisType.FACE_SEGMENTATION.value, AnalysisType.FULL.value]
            do_crack_detection = analysis_type in [AnalysisType.CRACK_DETECTION.value, AnalysisType.FULL.value]

            # Preload SAM2 image embedding once (if available) for both face and crack segmentation.
            sam2_predictor = self.pipeline.sam2_predictor
            sam2_image_preloaded = False
            if sam2_predictor is not None:
                try:
                    if progress_callback:
                        progress_callback("sam2_init", 8, "Preparing SAM2 embeddings...")
                    sam2_predictor.set_image(image_rgb)
                    sam2_image_preloaded = True
                except Exception as e:
                    print(f"[AnalysisService] SAM2 preloading skipped: {e}")
                    sam2_image_preloaded = False

            combined_mask = None
            seg_result = {"confidence": 0.0}

            # Run face segmentation pipeline (if needed)
            if do_face_segmentation:
                seg_result = self.pipeline.predict(
                    image_rgb,
                    use_sam2_refinement=True,
                    sam2_image_preloaded=sam2_image_preloaded,
                    progress_callback=make_scaled_callback(10, 60),
                )

                # Get combined mask
                combined_mask = seg_result["combined_mask"]
                if not np.any(combined_mask):
                    raise ValueError("未检测到有效掌子面区域，请检查图片清晰度/光照/拍摄角度后重试")
            else:
                # For crack-only detection, use the whole image as the ROI
                combined_mask = np.ones((image_rgb.shape[0], image_rgb.shape[1]), dtype=bool)
                if progress_callback:
                    progress_callback("skip_face", 70, "跳过掌子面分割，直接进行裂缝检测...")

            # Run excavation analysis (only for face segmentation)
            excavation = None
            mask_path = None
            overlay_path = None

            if do_face_segmentation:
                if progress_callback:
                    progress_callback("excavation", 72, "Running excavation analysis...")
                excavation_analyzer = ExcavationAnalyzer(
                    scale_mm_per_pixel=analysis.scale_mm_per_pixel or settings.SCALE_MM_PER_PIXEL,
                    design_area_m2=analysis.design_area_m2 or settings.DESIGN_AREA_M2,
                    tolerance_percent=2.0,
                )
                excavation = excavation_analyzer.analyze(combined_mask)

                # Save mask image
                mask_filename = f"{analysis_id}_mask.png"
                mask_path = settings.UPLOAD_DIR / mask_filename
                mask_uint8 = (combined_mask.astype(np.uint8) * 255)
                cv2.imwrite(str(mask_path), mask_uint8)

                # Create overlay image
                overlay_filename = f"{analysis_id}_overlay.png"
                overlay_path = settings.UPLOAD_DIR / overlay_filename
                overlay = self._create_overlay(image_rgb, combined_mask)
                cv2.imwrite(str(overlay_path), cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR))

            # Crack detection + segmentation (best-effort; does not fail the whole analysis if it errors)
            crack_mask = np.zeros_like(combined_mask, dtype=bool)
            crack_overlay_path = None
            crack_mask_path = None
            combined_overlay_path = None
            crack_count = 0
            crack_confidence = 0.0

            if do_crack_detection:
                if progress_callback:
                    progress_callback("crack_start", 80, "Detecting and segmenting cracks...")

                try:
                    # For crack-only mode, don't filter by face_mask
                    face_mask_for_crack = combined_mask if do_face_segmentation else None
                    crack_result = self.crack_pipeline.predict(
                        image_rgb,
                        face_mask=face_mask_for_crack,
                        progress_callback=make_scaled_callback(80, 15),
                    )
                    crack_mask = crack_result.get("combined_mask", crack_mask)
                    crack_boxes = crack_result.get("boxes", [])
                    crack_confidences = crack_result.get("confidences", [])
                    crack_count = int(crack_result.get("count", 0) or 0)
                    crack_confidence = float(crack_result.get("confidence", 0.0) or 0.0)
                except Exception as e:
                    print(f"[AnalysisService] Crack pipeline failed: {e}")
                    crack_boxes = []
                    crack_confidences = []

            crack_pixel_count = int(np.count_nonzero(crack_mask))

            # Save crack mask & overlays (only if crack detection was performed)
            if do_crack_detection:
                crack_mask_filename = f"{analysis_id}_crack_mask.png"
                crack_mask_path = settings.UPLOAD_DIR / crack_mask_filename
                crack_mask_uint8 = (crack_mask.astype(np.uint8) * 255)
                cv2.imwrite(str(crack_mask_path), crack_mask_uint8)

                crack_overlay_filename = f"{analysis_id}_crack_overlay.png"
                crack_overlay_path = settings.UPLOAD_DIR / crack_overlay_filename
                # Use bounding box overlay instead of mask overlay
                crack_overlay = self._create_box_overlay(
                    image_rgb,
                    crack_boxes,
                    crack_confidences,
                    box_color=(239, 68, 68),  # Red
                )
                cv2.imwrite(str(crack_overlay_path), cv2.cvtColor(crack_overlay, cv2.COLOR_RGB2BGR))

            # Save combined overlay (only if both were performed)
            if do_face_segmentation and do_crack_detection:
                combined_overlay_filename = f"{analysis_id}_combined_overlay.png"
                combined_overlay_path = settings.UPLOAD_DIR / combined_overlay_filename
                combined_overlay = self._create_multi_overlay(
                    image_rgb, combined_mask, crack_boxes, crack_confidences
                )
                cv2.imwrite(str(combined_overlay_path), cv2.cvtColor(combined_overlay, cv2.COLOR_RGB2BGR))

            if progress_callback:
                progress_callback("post_processing", 98, "Saving results...")

            # Update analysis record
            analysis.mask_image = str(mask_path) if mask_path else None
            analysis.overlay_image = str(overlay_path) if overlay_path else None
            analysis.crack_mask_image = str(crack_mask_path) if crack_mask_path else None
            analysis.crack_overlay_image = str(crack_overlay_path) if crack_overlay_path else None
            analysis.combined_overlay_image = str(combined_overlay_path) if combined_overlay_path else None

            # Set face segmentation results (only if performed)
            if do_face_segmentation and excavation:
                analysis.pixel_count = excavation.pixel_count
                analysis.actual_area_m2 = excavation.actual_area_m2
                analysis.design_area_m2 = excavation.design_area_m2
                analysis.scale_mm_per_pixel = excavation_analyzer.scale
                analysis.difference_m2 = excavation.difference_m2
                analysis.difference_percent = excavation.difference_percent
                analysis.excavation_status = excavation.status.value
                analysis.confidence = seg_result["confidence"]

            # Set crack detection results (only if performed)
            if do_crack_detection:
                analysis.crack_count = crack_count
                analysis.crack_pixel_count = crack_pixel_count
                analysis.crack_confidence = crack_confidence

            analysis.status = AnalysisStatus.COMPLETED.value
            analysis.completed_at = datetime.utcnow()

            await self.db.commit()
            await self.db.refresh(analysis)

            return analysis

        except Exception as e:
            # Update status to failed
            analysis.status = AnalysisStatus.FAILED.value
            analysis.error_message = str(e)
            await self.db.commit()
            raise

    def _create_overlay(
        self,
        image: np.ndarray,
        mask: np.ndarray,
        alpha: float = 0.4,
        color: tuple = (38, 166, 154)  # Teal color
    ) -> np.ndarray:
        """Create an overlay image with mask visualization."""
        overlay = image.copy()
        mask_bool = mask.astype(bool)

        # Create colored mask
        colored_mask = np.zeros_like(image)
        colored_mask[mask_bool] = color

        # Blend
        overlay = cv2.addWeighted(overlay, 1, colored_mask, alpha, 0)

        # Add contour
        mask_uint8 = mask.astype(np.uint8)
        contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(overlay, contours, -1, color, 2)

        return overlay

    def _create_box_overlay(
        self,
        image: np.ndarray,
        boxes: list,
        confidences: list,
        box_color: tuple = (239, 68, 68),  # Red color (RGB)
        thickness: int = 3,
        font_scale: float = 0.7,
    ) -> np.ndarray:
        """Create an overlay image with bounding boxes for crack detection.

        Args:
            image: Input image (RGB format)
            boxes: List of [x1, y1, x2, y2] coordinates
            confidences: List of confidence scores
            box_color: Color for boxes (RGB)
            thickness: Line thickness for boxes
            font_scale: Font scale for confidence text

        Returns:
            Image with bounding boxes drawn
        """
        overlay = image.copy()

        for i, box in enumerate(boxes):
            x1, y1, x2, y2 = box
            conf = confidences[i] if i < len(confidences) else 0.0

            # Draw rectangle
            cv2.rectangle(overlay, (x1, y1), (x2, y2), box_color, thickness)

            # Prepare label text
            label = f"crack {conf:.0%}"

            # Get text size for background
            (text_w, text_h), baseline = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, 2
            )

            # Draw label background
            label_y1 = max(0, y1 - text_h - 10)
            label_y2 = y1
            cv2.rectangle(
                overlay,
                (x1, label_y1),
                (x1 + text_w + 6, label_y2),
                box_color,
                -1  # Filled
            )

            # Draw label text (white)
            cv2.putText(
                overlay,
                label,
                (x1 + 3, y1 - 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                font_scale,
                (255, 255, 255),  # White text
                2,
                cv2.LINE_AA,
            )

        return overlay

    def _create_multi_overlay(
        self,
        image: np.ndarray,
        face_mask: np.ndarray,
        crack_boxes: list,
        crack_confidences: list,
        face_alpha: float = 0.35,
        face_color: tuple = (38, 166, 154),  # Teal
        crack_color: tuple = (239, 68, 68),  # Red
    ) -> np.ndarray:
        """Create overlay with face mask and crack bounding boxes."""
        overlay = image.copy()

        # Draw face mask overlay
        if np.any(face_mask):
            face_bool = face_mask.astype(bool)
            face_layer = np.zeros_like(image)
            face_layer[face_bool] = face_color
            overlay = cv2.addWeighted(overlay, 1, face_layer, face_alpha, 0)

            face_u8 = face_bool.astype(np.uint8)
            contours, _ = cv2.findContours(face_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(overlay, contours, -1, face_color, 2)

        # Draw crack bounding boxes
        if crack_boxes:
            overlay = self._create_box_overlay(
                overlay,
                crack_boxes,
                crack_confidences,
                box_color=crack_color,
            )

        return overlay

    async def get_analysis(self, analysis_id: int) -> Optional[Analysis]:
        """Get analysis by ID."""
        result = await self.db.execute(
            select(Analysis).where(Analysis.id == analysis_id)
        )
        return result.scalar_one_or_none()

    async def get_user_analyses(
        self,
        user_id: int,
        page: int = 1,
        limit: int = 20,
        status_filter: Optional[str] = None,
        search_query: Optional[str] = None
    ) -> tuple:
        """
        Get paginated analyses for a user.

        Returns:
            Tuple of (items, total_count)
        """
        query = select(Analysis).where(Analysis.user_id == user_id)

        if status_filter:
            query = query.where(Analysis.excavation_status == status_filter)

        if search_query:
            # Simple search: if digit, match ID.
            # Could be expanded to search tags/descriptions in future.
            if search_query.isdigit():
                query = query.where(Analysis.id == int(search_query))

        # Count total
        count_query = select(func.count(Analysis.id)).where(Analysis.user_id == user_id)
        if status_filter:
            count_query = count_query.where(Analysis.excavation_status == status_filter)
        if search_query and search_query.isdigit():
            count_query = count_query.where(Analysis.id == int(search_query))

        total_result = await self.db.execute(count_query)
        total = total_result.scalar()

        # Get paginated items
        query = query.order_by(Analysis.created_at.desc())
        query = query.offset((page - 1) * limit).limit(limit)
        result = await self.db.execute(query)
        items = result.scalars().all()

        return items, total

    async def get_trend_data(self, user_id: int, limit: int = 20) -> Dict[str, Any]:
        """Get trend data for dashboard chart.

        Returns the most recent N completed analyses with excavation data,
        ordered by ID (oldest first for chronological display).

        Args:
            user_id: User ID
            limit: Maximum number of data points (default 20)

        Returns:
            Dict with labels, over/under excavation data arrays, and data points
        """
        # Get recent completed analyses with excavation data
        query = select(Analysis).where(
            and_(
                Analysis.user_id == user_id,
                Analysis.status == AnalysisStatus.COMPLETED.value,
                Analysis.difference_m2.isnot(None),
                Analysis.actual_area_m2.isnot(None),
                Analysis.design_area_m2.isnot(None),
            )
        ).order_by(Analysis.id.desc()).limit(limit)

        result = await self.db.execute(query)
        analyses = list(result.scalars().all())

        # Reverse to get chronological order (oldest first)
        analyses.reverse()

        labels = []
        over_excavation_data = []
        under_excavation_data = []
        data_points = []

        for a in analyses:
            label = f"#{a.id}"
            labels.append(label)

            # Calculate over/under excavation areas
            diff = a.difference_m2 or 0.0
            if diff > 0:
                # Over-excavation: actual > design
                over_area = abs(diff)
                under_area = 0.0
            else:
                # Under-excavation: actual < design
                over_area = 0.0
                under_area = abs(diff)

            over_excavation_data.append(round(over_area, 2))
            under_excavation_data.append(round(under_area, 2))

            data_points.append({
                "id": a.id,
                "label": label,
                "over_excavation_area": round(over_area, 2),
                "under_excavation_area": round(under_area, 2),
                "difference_percent": a.difference_percent,
                "created_at": a.created_at,
            })

        return {
            "labels": labels,
            "over_excavation_data": over_excavation_data,
            "under_excavation_data": under_excavation_data,
            "data_points": data_points,
        }

    async def get_deviation_distribution(self, user_id: int) -> Dict[str, int]:
        """Get deviation distribution statistics.

        Categories based on difference_percent:
        - Severe over: > 5%
        - Minor over: 2% to 5%
        - Normal: -2% to 2%
        - Minor under: -5% to -2%
        - Severe under: < -5%
        """
        # Get all completed analyses with difference data
        query = select(Analysis).where(
            and_(
                Analysis.user_id == user_id,
                Analysis.status == AnalysisStatus.COMPLETED.value,
                Analysis.difference_percent.isnot(None),
            )
        )
        result = await self.db.execute(query)
        analyses = result.scalars().all()

        severe_over = 0
        minor_over = 0
        normal = 0
        minor_under = 0
        severe_under = 0

        for a in analyses:
            diff = a.difference_percent or 0.0
            if diff > 5.0:
                severe_over += 1
            elif diff > 2.0:
                minor_over += 1
            elif diff >= -2.0:
                normal += 1
            elif diff >= -5.0:
                minor_under += 1
            else:
                severe_under += 1

        return {
            "severe_over_count": severe_over,
            "minor_over_count": minor_over,
            "normal_count": normal,
            "minor_under_count": minor_under,
            "severe_under_count": severe_under,
        }

    async def get_stats(self, user_id: int) -> Dict[str, Any]:
        """Get analysis statistics for dashboard."""
        from datetime import timedelta
        today = datetime.utcnow().date()
        yesterday = today - timedelta(days=1)

        # Total analyses
        total_result = await self.db.execute(
            select(func.count(Analysis.id)).where(Analysis.user_id == user_id)
        )
        total = total_result.scalar() or 0

        # Today's analyses
        today_result = await self.db.execute(
            select(func.count(Analysis.id)).where(
                and_(
                    Analysis.user_id == user_id,
                    func.date(Analysis.created_at) == today
                )
            )
        )
        today_count = today_result.scalar() or 0

        # Yesterday's analyses
        yesterday_result = await self.db.execute(
            select(func.count(Analysis.id)).where(
                and_(
                    Analysis.user_id == user_id,
                    func.date(Analysis.created_at) == yesterday
                )
            )
        )
        yesterday_count = yesterday_result.scalar() or 0

        # Calculate today vs yesterday percent change
        today_vs_yesterday_percent = None
        if yesterday_count > 0:
            today_vs_yesterday_percent = round(
                ((today_count - yesterday_count) / yesterday_count) * 100, 1
            )

        # Status counts
        over_result = await self.db.execute(
            select(func.count(Analysis.id)).where(
                and_(
                    Analysis.user_id == user_id,
                    Analysis.excavation_status == "over_excavation"
                )
            )
        )
        over_count = over_result.scalar() or 0

        under_result = await self.db.execute(
            select(func.count(Analysis.id)).where(
                and_(
                    Analysis.user_id == user_id,
                    Analysis.excavation_status == "under_excavation"
                )
            )
        )
        under_count = under_result.scalar() or 0

        normal_result = await self.db.execute(
            select(func.count(Analysis.id)).where(
                and_(
                    Analysis.user_id == user_id,
                    Analysis.excavation_status == "within_tolerance"
                )
            )
        )
        normal_count = normal_result.scalar() or 0

        # Average difference
        avg_result = await self.db.execute(
            select(func.avg(Analysis.difference_percent)).where(
                and_(
                    Analysis.user_id == user_id,
                    Analysis.difference_percent.isnot(None)
                )
            )
        )
        avg_diff = avg_result.scalar() or 0.0

        return {
            "total_analyses": total,
            "today_analyses": today_count,
            "yesterday_analyses": yesterday_count,
            "today_vs_yesterday_percent": today_vs_yesterday_percent,
            "over_excavation_count": over_count,
            "under_excavation_count": under_count,
            "normal_count": normal_count,
            "avg_difference_percent": round(avg_diff, 2)
        }

    async def delete_analysis(self, analysis_id: int, user_id: int) -> bool:
        """Delete an analysis record."""
        result = await self.db.execute(
            select(Analysis).where(
                and_(Analysis.id == analysis_id, Analysis.user_id == user_id)
            )
        )
        analysis = result.scalar_one_or_none()

        if not analysis:
            return False

        # Delete associated files
        for path_attr in [
            'original_image',
            'mask_image',
            'overlay_image',
            'crack_mask_image',
            'crack_overlay_image',
            'combined_overlay_image',
        ]:
            path = getattr(analysis, path_attr)
            if path:
                file_path = Path(path)
                if file_path.exists():
                    file_path.unlink()

        await self.db.delete(analysis)
        await self.db.commit()
        return True
