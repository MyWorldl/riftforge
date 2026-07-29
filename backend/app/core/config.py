from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    riot_api_key: str = "changeme"
    riot_platform_region: str = "br1"
    riot_continent_region: str = "americas"

    data_dragon_base_url: str = "https://ddragon.leagueoflegends.com"

    # Trava o app numa versão específica do Data Dragon (ex: "14.15.1") em vez de
    # sempre buscar a mais recente. None = comportamento padrão (usa a última versão
    # publicada). Existe para permitir congelar o patch via env var sem tocar código,
    # conforme "versão de patch alvo... nunca deve estar hardcoded" (documento base do
    # projeto, seção 6).
    target_patch_version: str | None = None

    database_url: str = "sqlite:///./riftforge.db"

    app_env: str = "development"
    cors_origins: str = "http://localhost:5173,https://riftforge-datadog-monitors.vercel.app"

    # Rate limiting por IP (protege a cota da Riot API e o backend contra abuso).
    rate_limit_default: str = "60/minute"
    rate_limit_riot_proxy: str = "10/minute"


@lru_cache
def get_settings() -> Settings:
    return Settings()
