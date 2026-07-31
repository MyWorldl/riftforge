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

    # Política de retenção de PUUID (Core §06_SEGURANCA_PRIVACIDADE.md §7,
    # rodada 18). Mesmo valor de `ingest_days_window` de propósito: PUUID
    # só serve pra viabilizar a expansão "bola de neve" a partir de
    # partidas ainda dentro da janela de coleta ativa — uma vez fora dela,
    # a mesma lógica que já decide "não vale mais buscar essa partida de
    # novo" também decide "não vale mais guardar quem jogou ela". Ver
    # app/jobs/purge_puuid.py.
    puuid_retention_days: int = 42

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
    # Recalibrado (rodada 18) a partir de margem de erro estatística real,
    # não de um número redondo: n = z² × p(1-p) / e² (tamanho de amostra
    # padrão pra estimar uma proporção). Com z=1,96 (95% de confiança) e
    # p=0,5 (pior caso de variância), e=1% de margem de erro no win rate
    # exige n≈9.604 — arredondado pra 10.000, o dobro do valor anterior
    # (5000, que correspondia a ±1,4% de margem — já rigoroso, mas o
    # usuário pediu "praticamente certeza": ±1% é o padrão de pesquisa
    # eleitoral rigorosa).
    #
    # Consequência conhecida e aceita: com o volume de coleta atual (a
    # melhor combinação campeão/rota chegava a ~507 partidas na rodada 12,
    # ~5% de confiança nessa escala), nenhum campeão deve sair de tier
    # provisório tão cedo. É a troca deliberada — o app fica mais honesto
    # sobre incerteza em vez de mais otimista sobre tier. Ainda EM ABERTO
    # por elo: elos de baixa população (Grão-Mestre, Desafiante) podem
    # nunca atingir esse volume mesmo com o campeão genuinamente forte
    # (02_MODELO_SCORE_TIERS.md §11).
    n_referencia_confianca: int = 10000
    # Trava de segurança (02_MODELO_SCORE_TIERS.md §11): abaixo deste
    # percentual de confiança, o tier fica provisório e limitado ao teto A.
    confianca_minima_pct: float = 30.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
