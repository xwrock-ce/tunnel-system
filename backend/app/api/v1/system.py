"""System status API endpoints."""
import time
import psutil
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.database import User
from app.api.v1.auth import get_current_user
from app.api.schemas import (
    SystemStatusResponse, SystemResourceStatus, ModelStatusItem
)

router = APIRouter(prefix="/system", tags=["System"])

# Track application start time for uptime calculation
_start_time = time.time()


def get_gpu_info() -> dict:
    """Get GPU information using pynvml if available.

    Returns:
        Dict with gpu_percent, gpu_memory_used_gb, gpu_memory_total_gb, gpu_available
    """
    result = {
        "gpu_percent": None,
        "gpu_memory_used_gb": None,
        "gpu_memory_total_gb": None,
        "gpu_available": False,
    }

    try:
        import pynvml
        pynvml.nvmlInit()

        # Get first GPU (most systems have one)
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)

        # Get memory info
        mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
        result["gpu_memory_used_gb"] = round(mem_info.used / (1024 ** 3), 2)
        result["gpu_memory_total_gb"] = round(mem_info.total / (1024 ** 3), 2)

        # Calculate GPU memory usage percentage
        if mem_info.total > 0:
            result["gpu_percent"] = round((mem_info.used / mem_info.total) * 100, 1)

        result["gpu_available"] = True
        pynvml.nvmlShutdown()

    except ImportError:
        # pynvml not installed, try nvidia-smi as fallback
        try:
            import subprocess
            output = subprocess.check_output(
                ["nvidia-smi", "--query-gpu=memory.used,memory.total,utilization.gpu",
                 "--format=csv,noheader,nounits"],
                timeout=5
            ).decode().strip()

            parts = output.split(",")
            if len(parts) >= 3:
                mem_used = float(parts[0].strip())
                mem_total = float(parts[1].strip())
                gpu_util = float(parts[2].strip())

                result["gpu_memory_used_gb"] = round(mem_used / 1024, 2)
                result["gpu_memory_total_gb"] = round(mem_total / 1024, 2)
                result["gpu_percent"] = gpu_util
                result["gpu_available"] = True

        except (subprocess.SubprocessError, FileNotFoundError, ValueError):
            pass

    except Exception:
        # Any other error, GPU monitoring not available
        pass

    return result


def get_model_status() -> list:
    """Get status of loaded ML models.

    Returns:
        List of ModelStatusItem dicts
    """
    models = []

    # Check YOLO face segmentation model
    try:
        from app.ml.pipeline import get_pipeline
        pipeline = get_pipeline()
        yolo_loaded = pipeline._yolo_model is not None

        models.append({
            "name": "YOLOv11-L 掌子面检测",
            "version": "v2.4",
            "status": "online" if yolo_loaded else "standby",
            "speed": "~12ms/frame" if yolo_loaded else "-",
            "loaded": yolo_loaded,
        })

        # Check SAM2 model
        sam2_loaded = pipeline._sam2_predictor is not None
        models.append({
            "name": "SAM2 分割优化",
            "version": "v2.1",
            "status": "online" if sam2_loaded else "standby",
            "speed": "~50ms/frame" if sam2_loaded else "-",
            "loaded": sam2_loaded,
        })

    except Exception:
        models.append({
            "name": "YOLOv11-L 掌子面检测",
            "version": "v2.4",
            "status": "offline",
            "speed": "-",
            "loaded": False,
        })
        models.append({
            "name": "SAM2 分割优化",
            "version": "v2.1",
            "status": "offline",
            "speed": "-",
            "loaded": False,
        })

    # Check crack detection model
    try:
        from app.ml.crack_pipeline import get_crack_pipeline
        crack_pipeline = get_crack_pipeline()
        crack_loaded = crack_pipeline._yolo_model is not None

        models.append({
            "name": "YOLOv11 裂缝检测",
            "version": "v1.0",
            "status": "online" if crack_loaded else "standby",
            "speed": "~8ms/frame" if crack_loaded else "-",
            "loaded": crack_loaded,
        })

    except Exception:
        models.append({
            "name": "YOLOv11 裂缝检测",
            "version": "v1.0",
            "status": "offline",
            "speed": "-",
            "loaded": False,
        })

    return models


@router.get("/status", response_model=SystemStatusResponse)
async def get_system_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get real-time system status including CPU, memory, GPU, and model status.

    Returns:
        SystemStatusResponse with resources and model information
    """
    # Get CPU and memory info
    cpu_percent = psutil.cpu_percent(interval=0.1)
    memory = psutil.virtual_memory()

    # Get GPU info
    gpu_info = get_gpu_info()

    resources = SystemResourceStatus(
        cpu_percent=round(cpu_percent, 1),
        memory_percent=round(memory.percent, 1),
        memory_used_gb=round(memory.used / (1024 ** 3), 2),
        memory_total_gb=round(memory.total / (1024 ** 3), 2),
        gpu_percent=gpu_info["gpu_percent"],
        gpu_memory_used_gb=gpu_info["gpu_memory_used_gb"],
        gpu_memory_total_gb=gpu_info["gpu_memory_total_gb"],
        gpu_available=gpu_info["gpu_available"],
    )

    # Get model status
    model_list = get_model_status()
    models = [ModelStatusItem(**m) for m in model_list]

    # Calculate uptime
    uptime_seconds = time.time() - _start_time

    return SystemStatusResponse(
        resources=resources,
        models=models,
        uptime_seconds=round(uptime_seconds, 0),
    )
