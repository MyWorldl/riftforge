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

    # Janela de coleta, em dias. Só partidas mais recentes que isso são
    # ingeridas. Existe porque o histórico de um invocador se estende por
    # mais de um ano, mas o modelo só consome os 3 patches mais recentes
    # (Build usa média móvel de 3 patches, Meta usa regressão sobre até 3)
    # — sem o corte, a maior parte da cota da Riot é gasta em patches que
    # nenhuma consulta alcança, e o dado ainda dilui a confiança por
    # espalhar as partidas entre dezenas de patches.
    # 42 = ~3 patches a ~14 dias cada. É aproximação: a cadência real de
    # patch varia, então a janela é deliberadamente generosa (melhor pegar
    # um patch a mais que perder o terceiro).
    ingest_days_window: int = 42

    app_env: str = "development"
    cors_origins: str = "http://localhost:5173,https://riftforge-self.vercel.app"

    # Rate limiting por IP (protege a cota da Riot API e o backend contra abuso).
    rate_limit_default: str = "60/minute"
    rate_limit_riot_proxy: str = "10/minute"

    # Parâmetros de calibração do modelo de score (Core/Estrutura_roadmap/
    # 02_MODELO_SCORE_TIERS.md, 16_BASELINES_CALIBRACAO.md) — nunca hardcoded
    # no código de cálculo, conforme 05_BOAS_PRATICAS_CODIGO.md §7.
    wilson_z: float = 1.96  # 95% de confiança — padrão estatístico, baixa prioridade de recalibração
    # EM ABERTO em 16_BASELINES_CALIBRACAO.md §2/§8: percentual de corte da
    # média/desvio aparados ainda não validado contra dados reais. 0.10 =
    # remove 5% de cada ponta antes de calcular média/desvio do baseline.
    baseline_trim_pct: float = 0.10
    # EM ABERTO em 16_BASELINES_CALIBRACAO.md §3/§8: nº mínimo de campeões no
    # grupo (rota, elo, patch) pra considerar o baseline confiável.
    baseline_min_champions: int = 5
    # EM ABERTO em 16_BASELINES_CALIBRACAO.md §5: precisa de backtesting contra
    # um patch conhecido (02_MODELO_SCORE_TIERS.md §4.1) — controla o quão
    # "esticada" fica a curva logística que converte z-score em Nota_WR 0-100.
    performance_fator_logistico: float = 1.1
    # EM ABERTO em 16_BASELINES_CALIBRACAO.md §5: validar se é adequado por
    # elo — elos de baixa população (Grão-Mestre, Desafiante) podem nunca
    # atingir esse volume mesmo com o campeão genuinamente forte
    # (02_MODELO_SCORE_TIERS.md §11).
    n_referencia_confianca: int = 5000
    # Trava de segurança (02_MODELO_SCORE_TIERS.md §11): abaixo deste
    # percentual de confiança, o tier fica provisório e limitado ao teto A.
    confianca_minima_pct: float = 30.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
