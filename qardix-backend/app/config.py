from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    DATABASE_URL: str
    DATABASE_URL_SYNC: str

    # Supabase Storage (backend only)
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str
    ECG_BUCKET: str = "ecg-images"

    # JWT
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ECG Inference — the ONLY variable you need to change to switch backends
    INFERENCE_BACKEND: str = "colab"  # "colab" | "local"

    # Colab (active when INFERENCE_BACKEND=colab)
    COLAB_INFERENCE_URL: str = ""
    COLAB_API_KEY: str = ""

    # Local models (active when INFERENCE_BACKEND=local)
    LOCAL_DIGITISER_MODEL_PATH: str = "./ai/ecg_digitiser/weights/"
    LOCAL_WCR77_MODEL_PATH: str = "./ai/deep_ecg/weights/"

    # Server
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    APP_ENV: str = "development"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
