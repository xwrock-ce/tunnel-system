"""Application configuration settings."""
from pydantic_settings import BaseSettings
from pathlib import Path
from functools import lru_cache


def _infer_base_dir() -> Path:
    """Infer project base dir across dev/docker layouts.

    Local repo layout: <base>/backend/app/config.py (base contains docker-compose.yml)
    Docker layout: /app/app/config.py (base is /app)
    """
    here = Path(__file__).resolve()

    # Prefer the directory that contains docker-compose.yml (local repo root).
    for parent in here.parents:
        if (parent / "docker-compose.yml").exists():
            return parent

    # Fallback: assume /<base>/app/config.py inside container.
    return here.parent.parent


class Settings(BaseSettings):
    """Application settings with environment variable support."""

    # Application
    APP_NAME: str = "Tunnel Excavation Detection System"
    APP_VERSION: str = "1.1.0"
    DEBUG: bool = False

    # API
    API_V1_PREFIX: str = "/api/v1"

    # Security
    SECRET_KEY: str = "tunnel-excavation-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Default admin credentials
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin123"

    # Paths
    BASE_DIR: Path = _infer_base_dir()
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    MODEL_WEIGHTS_DIR: Path = BASE_DIR / "model_weights"
    STATIC_DIR: Path = BASE_DIR / "static"
    DATABASE_URL: str = "sqlite+aiosqlite:///./tunnel.db"

    # Model paths (relative to MODEL_WEIGHTS_DIR)
    YOLO_WEIGHTS: str = "yolo_best.pt"
    CRACK_YOLO_WEIGHTS: str = "crack_best.pt"
    CRACK_USE_SAM2: bool = False
    SAM2_BASE_CHECKPOINT: str = "sam2_base.pt"
    SAM2_FINETUNED_CHECKPOINT: str = "sam2_finetuned.pt"
    SAM2_CONFIG: str = "sam2_configs/sam2.1/sam2.1_hiera_b+.yaml"

    # Excavation analysis parameters
    SCALE_MM_PER_PIXEL: float = 7.6
    DESIGN_AREA_M2: float = 78.5

    # File upload limits
    MAX_UPLOAD_SIZE: int = 20 * 1024 * 1024  # 20MB
    ALLOWED_EXTENSIONS: set = {"jpg", "jpeg", "png", "bmp", "tiff"}

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()

# Ensure directories exist
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.STATIC_DIR.mkdir(parents=True, exist_ok=True)
