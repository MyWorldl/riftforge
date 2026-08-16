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
    # precisa ficar pequeno pra não estourar cota por usuário. Subido de 10
    # pra 20 no Sprint 4 (16/08): a nova aba Partidas precisa de histórico
    # suficiente pra não parecer vazia com só 1-2 jogos do dia.
    player_lookup_recent_matches: int = 20

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
    wilson_z: float = (
        1.96  # 95% de confiança — padrão estatístico, baixa prioridade de recalibração
    )
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
    # Recalibrado de novo (Sprint 5 item 25, rodada 29) a partir do volume
    # real de produção, não mais de um alvo de margem de erro abstrato: com
    # 7.373 partidas br1 + 2.418 euw1 acumuladas, o grupo (patch, elo, rota,
    # campeão) mais jogado de todos chega a **540** partidas (br1) — bem
    # abaixo do 10.000 fixado na rodada 18. Nesse valor, 0 das 7.167 linhas
    # de `champion_scores` em produção já saíram de "provisório" (confiança
    # média 0,13-0,18%), tornando o indicador de confiança inútil na prática
    # (sempre baixo, nunca discrimina "amostra boa" de "amostra ruim").
    #
    # 1.000 escolhido como ~2x o teto real observado — dá margem de
    # crescimento (não fica obsoleto no primeiro patch bom) sem ser
    # inatingível como o valor anterior. Mesma fórmula n = z² × p(1-p) / e²
    # da rodada 18: com z=1,96 e p=0,5, n=1.000 corresponde a ±3,1% de
    # margem de erro (vs. ±1% do valor anterior) — trade-off deliberado
    # entre "atingível com o volume de coleta real" e "preciso o bastante
    # pra o indicador de confiança significar algo". Ainda EM ABERTO por
    # elo: elos de baixa população (Grão-Mestre, Desafiante) podem nunca
    # atingir esse volume mesmo com o campeão genuinamente forte
    # (02_MODELO_SCORE_TIERS.md §11).
    n_referencia_confianca: int = 1000
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

    # Snapshot de rank por temporada (Sprint 4, 16/08): diferente do
    # roadmap acima (que só grava linha com gap, e ganha token de exclusão
    # nesse caso), grava pra QUALQUER jogador buscado — decisão do usuário
    # foi janela rolante em vez de exclusão manual pareada. ~400 dias
    # cobre 1 temporada de LoL (splits somados) com folga; sem endpoint de
    # temporada exposto pela Riot pra recortar com precisão.
    player_rank_snapshot_retention_days: int = 400


@lru_cache
def get_settings() -> Settings:
    return Settings()
