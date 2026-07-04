import os

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()

DEFAULT_JWT_SECRET = "stairdoc-dev-secret-key-change-in-production-min-32-chars!"
DEFAULT_DEMO_PASSWORD = "password123"
DEFAULT_DEV_ORIGINS = ",".join(
    [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]
)


def _split_csv(value: str) -> list[str]:
    return [item.strip().rstrip("/") for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    PROJECT_NAME: str = "Stair-Doc"
    PROJECT_DESCRIPTION: str = "Autonomous stair-climbing delivery robot control API"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DB_URL: str = os.getenv("DB_URL", "")
    DB_API_KEY: str = os.getenv("DB_API_KEY", "")
    DB_EMAIL: str = os.getenv("DB_EMAIL", "")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    API_VERSION: str = "/api/v1"
    ROOT: str = os.getenv("ROOT_PATH", "")

    # ── Browser and Socket.IO origins ────────────────────────────────────
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", DEFAULT_DEV_ORIGINS)
    SOCKET_CORS_ORIGINS: str = os.getenv("SOCKET_CORS_ORIGINS", "")

    # ── JWT auth ──────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", DEFAULT_JWT_SECRET)
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_DAYS: int = 20
    DEMO_USER_PASSWORD: str = os.getenv("DEMO_USER_PASSWORD", DEFAULT_DEMO_PASSWORD)

    # ── Robot hardware bridge (Raspberry Pi) ─────────────────────────────
    ROBOT_BRIDGE_TOKEN: str = os.getenv("ROBOT_BRIDGE_TOKEN", "")
    BRIDGE_STALE_SECONDS: int = int(os.getenv("BRIDGE_STALE_SECONDS", "15"))

    # ── Prototype persistence ────────────────────────────────────────────
    DATA_DIR: str = os.getenv(
        "STAIRDOC_DATA_DIR",
        os.path.join(os.path.dirname(os.path.dirname(__file__)), ".stairdoc-data"),
    )

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in {"production", "prod"}

    @property
    def cors_origins(self) -> list[str]:
        return _split_csv(self.CORS_ORIGINS)

    @property
    def socket_cors_origins(self) -> list[str]:
        return _split_csv(self.SOCKET_CORS_ORIGINS or self.CORS_ORIGINS)


settings = Settings()


def validate_production_settings() -> None:
    """Fail fast when production starts with insecure demo defaults."""
    if not settings.is_production:
        return

    errors: list[str] = []
    if settings.JWT_SECRET_KEY == DEFAULT_JWT_SECRET or len(settings.JWT_SECRET_KEY) < 32:
        errors.append("set JWT_SECRET_KEY to a unique value of at least 32 characters")
    if settings.DEMO_USER_PASSWORD == DEFAULT_DEMO_PASSWORD:
        errors.append("set DEMO_USER_PASSWORD away from the development default")
    if not settings.ROBOT_BRIDGE_TOKEN or len(settings.ROBOT_BRIDGE_TOKEN) < 16:
        errors.append("set ROBOT_BRIDGE_TOKEN to a unique value of at least 16 characters")
    if "*" in settings.cors_origins or not settings.cors_origins:
        errors.append("set CORS_ORIGINS to the deployed frontend origin")

    if errors:
        raise RuntimeError("Invalid production configuration: " + "; ".join(errors))
