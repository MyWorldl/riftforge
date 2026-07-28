from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    riot_api_key: str = "changeme"
    riot_platform_region: str = "br1"
    riot_continent_region: str = "americas"

    data_dragon_base_url: str = "https://ddragon.leagueoflegends.com"

    database_url: str = "sqlite:///./riftforge.db"

    app_env: str = "development"
    cors_origins: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()
