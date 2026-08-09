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

    # Só usada pelo Alembic (`alembic/env.py`), nunca pelo app em si — deve
    # apontar pra conexão DIRETA do Supabase (porta 5432), nunca o pooler
    # pgbouncer (porta 6543) usado em `database_url` acima: DDL sob
    # pgbouncer transaction-mode é instável. `None` (padrão) faz o Alembic
    # cair em `database_url` (SQLite em dev local).
    migrations_database_url: str | None = None

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
    # `http://tauri.localhost` (HTTP, não HTTPS) é a origem que o WebView2
    # usa pro app desktop no Windows (Tauri v2) — errei isso na primeira
    # tentativa (coloquei https://), o que não corrigiu nada; confirmado
    # via issue oficial do Tauri (block/buzz#3490, mesmo sintoma) que o
    # esquema é http. `tauri://localhost` é a origem equivalente em
    # macOS/Linux (WKWebView/WebKitGTK), incluída por precaução mesmo o
    # app hoje só distribuindo instalador Windows. Sem isso, todo fetch
    # do app empacotado falha com "Failed to fetch" — a chamada nunca sai
    # com erro de rede, é bloqueada pelo CORSMiddleware (confirmado:
    # resposta "Disallowed CORS origin" simulando a origem via curl).
    cors_origins: str = (
        "http://localhost:5173,https://riftforge-self.vercel.app,"
        "http://tauri.localhost,tauri://localhost"
    )

    # Rate limiting por IP (protege a cota da Riot API e o backend contra abuso).
    rate_limit_default: str = "60/minute"
    rate_limit_riot_proxy: str = "10/minute"
    # Mais restritivo que rate_limit_riot_proxy: aquele é debug interno,
    # este fica público atrás do formulário de busca da Home (item novo,
    # rodada 19) — qualquer visitante pode disparar, não só quem sabe a
    # URL do endpoint.
    rate_limit_player_lookup: str = "5/minute"
    # Quantas partidas recentes o lookup de "Análise do Jogador" busca por
    # clique — sob demanda, ao contrário do resto do pipeline (batch), então
    # precisa ficar pequeno pra não estourar cota por usuário.
    player_lookup_recent_matches: int = 10

    # Quantos jogadores por tier por região (Desafiante/Grão-Mestre/Mestre)
    # o job de ranking resolve nome/nível/ícone via Account-V1 + Summoner-V4
    # (app/jobs/collect_rankings.py). Reduzido de 50 pra 20 na rodada 20
    # (filtro por região) pra compensar a coleta agora cobrir várias regiões
    # — sem isso, o tempo do job cresceria na mesma proporção do número de
    # regiões, já que cada jogador resolvido custa 2 chamadas Riot.
    rankings_top_n_per_tier: int = 20
    # Regiões de plataforma cobertas pelo filtro de região do Rankings
    # (rodada 20). Só as de maior audiência — cobrir as 8 do seletor da
    # Home multiplicaria a cota da Riot por 8; escolha deliberada de manter
    # o job rápido em vez de completo. String separada por vírgula, mesmo
    # padrão de `cors_origins`.
    rankings_platform_regions: str = "br1,na1,euw1,kr"

    # Item novo (filtro de região, piloto br1+euw1): regiões que as 9 jobs
    # de compute do pipeline de score processam a cada execução — mesmo
    # formato de `rankings_platform_regions`. Fica em "br1" por padrão de
    # propósito (só o CI, via `env:` do workflow, muda pra "br1,euw1" —
    # assim um `pytest`/dev local nunca tenta euw1 sem opt-in explícito).
    # Adicionar uma região aqui depois de já ter dado ingerido é o único
    # passo de configuração necessário pras jobs de compute passarem a
    # processá-la — nenhuma delas precisa de mudança de código.
    pipeline_platform_regions: str = "br1"

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

    # Itens novos (rodada 21, backlog Fase 3/4 — Matchups, Build
    # recomendado, Skill Expression). Mesmo espírito de
    # `baseline_min_champions`: nunca mostra uma taxa calculada sobre
    # amostra minúscula como se fosse confiável sem avisar
    # (`amostra_insuficiente` nas tabelas correspondentes).
    matchup_min_games: int = 5
    build_recommendation_min_games: int = 5
    # Precisa ser grande o suficiente pra um quintil de 20% (melhores/
    # piores jogos) fazer sentido — com menos que isso, "os 20% piores
    # jogos" seria 1-2 partidas isoladas, não uma tendência real.
    skill_expression_min_games: int = 20

    # Item novo (rodada 22, backlog 6.2): quantos invocadores
    # `ingest_matches.py` processa em paralelo (threads, não asyncio — o
    # cliente da RiotWatcher usa `requests` por baixo). Seguro porque o
    # limitador de taxa da própria RiotWatcher é thread-safe (usa locks
    # internos) e é compartilhado entre as threads via uma única instância
    # de `RiotApiAdapter`. Valor conservador: o rate limit real da chave
    # (20 req/1s) tem que sobrar margem mesmo se várias threads disparem a
    # primeira chamada antes de qualquer resposta atualizar o limitador.
    ingest_concurrency: int = 5

    # Revisão técnica §3 (Nível 2, fora de escopo por ora — sem conta
    # Datadog disponível): presença desta chave é o único gate de
    # `app/core/metrics.py`. Ausente, as funções de métrica viram no-op —
    # não é um TODO, é a escolha deliberada de deixar o código pronto pra
    # conectar depois sem fingir que já está conectado agora.
    datadog_api_key: str | None = None

    # Roadmap de Progressão do Jogador (rodada 28). Mesmo espírito de
    # `matchup_min_games`/`build_recommendation_min_games`: piso de
    # confiança pra estatística por campeão+rota, sem dado real de uso
    # ainda — EM ABERTO, recalibrável quando houver volume real.
    roadmap_min_matches: int = 5
    # "Roadmap" é foco, não backlog — 3 cabe como bloco fixo na UI sem
    # virar lista infinita. EM ABERTO.
    roadmap_max_active_steps: int = 3
    # Gap real, não ruído de amostra pequena, pra virar passo. EM ABERTO.
    roadmap_gap_threshold_pct: float = -10.0
    # Cruzar zero = alcançou a média do elo — mesma semântica que
    # `delta_pct` já tem, sem margem extra inventada sem dado real.
    roadmap_completion_threshold_pct: float = 0.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
