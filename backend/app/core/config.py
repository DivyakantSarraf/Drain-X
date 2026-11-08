from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    DRAIN-X Core Application Settings.
    Loaded from environment variables or .env file.
    """
    APP_NAME: str = "DRAIN-X Predictive Drainage Intelligence"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: Literal["development", "production", "testing"] = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    # System Operational Mode: SIMULATION or HARDWARE
    SYSTEM_MODE: Literal["SIMULATION", "HARDWARE"] = "SIMULATION"

    # Server binding
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    # Database Settings (Optional for local operation)
    DATABASE_URL: str | None = None
    SUPABASE_URL: str | None = None
    SUPABASE_KEY: str | None = None

    # MQTT Settings
    MQTT_BROKER_HOST: str = "localhost"
    MQTT_BROKER_PORT: int = 1883
    MQTT_CLIENT_ID: str = "drainx_backend_core"
    MQTT_TOPIC_PREFIX: str = "drainx/v1"

    # Telemetry Ingestion Thresholds (Configurable defaults)
    MAX_WATER_DEPTH_CM: float = 15.0
    CRITICAL_WATER_DEPTH_CM: float = 12.0
    SENSOR_STALE_TIMEOUT_SEC: float = 10.0

    # Photo Upload Settings (Competition MVP local storage)
    UPLOAD_DIR: str = "uploads/incidents"
    MAX_PHOTO_SIZE_BYTES: int = 5 * 1024 * 1024  # 5 MB
    MAX_PHOTOS_PER_INCIDENT: int = 3

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
