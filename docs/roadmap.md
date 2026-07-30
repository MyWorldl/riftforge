# Roteiro de Desenvolvimento — RiftForge

Baseado em `Core/Estrutura_roadmap/00_INDEX.md` (fonte de verdade atual — tem precedência sobre o PDF em caso de divergência, ver `Core/Estrutura_roadmap/10_REFERENCIAS.md` §7). Stack: backend Python, frontend web primeiro, desktop depois (reaproveitando o mesmo frontend, ex. via Tauri).

**Nota (2026-07-29):** as Fases 0–10 abaixo cobrem a v0 (placar de força cru: win/pick/ban rate + KDA). O modelo de score em camadas com tiers God–E definido em `Core/Estrutura_roadmap/02_MODELO_SCORE_TIERS.md` ainda não foi implementado — ver gap detalhado em `Core/Estrutura_roadmap/17_ESTADO_IMPLEMENTADO.md` e priorização em `Core/Estrutura_roadmap/09_BACKLOG.md`.

**A partir daqui, o trabalho novo é rastreado pelas fases do `Core/Estrutura_roadmap/09_BACKLOG.md` (numeração própria, não confundir com as Fases 0–10 abaixo)** — ver seção "Core — Fase 0" ao final deste arquivo para o progresso.

## Fase 0 — Fundação
- [x] Estrutura do repositório (`backend/`, `frontend/`), `.gitignore`, `.env.example`, README.
- [x] Registrar o projeto no Riot Developer Portal e gerar a Development Key.

## Fase 1 — Camada de dados estáticos (Data Dragon)
- [x] Adapter isolando as chamadas ao Data Dragon (sem rate limit, sem auth).
- [x] Versionamento explícito do patch em cada dado salvo.
- [x] Cache local + teste automatizado de schema.

## Fase 2 — Camada de dados dinâmicos (Riot API)
- [x] Integração com RiotWatcher para League-V4 (entries) e Match-V5 (by_id).
- [x] Rate limiting embutido via a biblioteca escolhida (RiotWatcher).
- [x] Coleta de partidas segmentada por elo, rota e região (feita na Fase 3).

## Fase 3 — Banco próprio + job de agregação
- [x] Modelar tabelas: win rate / pick rate / ban rate / KDA por campeão × elo × rota × patch.
- [x] Job periódico que popula o banco a partir da Riot API. **Atualizado:** substituído por `app/jobs/ingest_matches.py` (partidas brutas, dedup persistida) + `app/jobs/aggregate_stats.py` (cálculo, sem chamar a Riot) — ver seção "Core — Fase 0" ao final deste arquivo.

## Fase 4 — Backend/API (proxy)
- [x] Endpoint `/stats/champions` servindo o placar de força lido só do banco próprio.
- [x] Rate limiting por IP (slowapi): 10/min nos endpoints que fazem proxy direto da Riot, 60/min padrão nos demais; limites configuráveis via env vars.

## Fase 5 — Frontend Web (MVP)
- [x] Placar de força dos campeões com filtros por elo/rota/patch, cruzando com nome/imagem do Data Dragon.
- [x] Deploy inicial do MVP: backend (`riftforge-api`) e frontend (`riftforge`) na Vercel, banco Postgres no Supabase. Falta só: usuário desativar "Vercel Authentication" nos dois projetos e configurar `DATABASE_URL` no backend (ver README § Deploy).

## Fase 6 — Progressão de chave Riot (em paralelo, a partir da Fase 5)
- [x] Pedir Personal Key assim que o MVP estiver minimamente funcional (App ID 864953, aprovada — não expira em 24h como a Development Key, mas ainda não pode ser exposta no backend público; segue usada só localmente pelo job).
- [ ] **Adiado** — Domínio próprio, Termos de Uso e Política de Privacidade. Só necessário quando o app for abrir para o público em geral.
- [ ] **Adiado** — Submeter pedido de Production Key. Enquanto o app ficar em uso pessoal/protótipo, a Personal Key já cobre a necessidade.

## Fase 7 — Segurança e conformidade
- [x] HTTPS obrigatório — já garantido pela Vercel (frontend/backend) e Supabase (banco) por padrão.
- [x] Criptografia em repouso — gerenciada pelo Supabase por padrão.
- [x] Minimização de dados — o banco próprio (`champion_lane_stats`, `champion_ban_stats`, `segment_totals`) nunca armazena PUUID nem qualquer dado pessoal, só contagens agregadas por campeão/elo/rota/patch.
- [ ] RSO/OAuth — não se aplica ainda; só necessário se o app passar a vincular contas de usuário (fora do escopo atual).
- [x] Logs sem dados sensíveis — nenhum endpoint próprio expõe PUUID, API keys ou tokens.
- [ ] Política de retenção/exclusão (LGPD) — não se aplica ainda; nenhum dado pessoal é coletado.

## Fase 8 — Testes e monitoramento contínuo
- [x] Testes de schema no CI (GitHub Actions, repo https://github.com/MyWorldl/riftforge): roda a cada push/PR em `backend/**` e semanalmente via cron, cobrindo Data Dragon e League-V4/Match-V5 (chave da Riot como secret só na CI).
- [x] Monitoramento de deprecação de endpoints: coberto pela CI semanal acima — falha manda notificação do GitHub pro dono do repo.
- [x] Alertas de 429: sem automação por ora (decisão consciente) — checagem manual via Vercel Runtime Logs, documentado no README § Operação.

## Fase 9 — Lançamento público
- [ ] **Adiado** — Deploy final após aprovação da Production Key. Retomar quando houver interesse em abrir o app ao público em geral.

## Fase 10 — Evolução para Desktop
- [x] Empacotar o frontend web com Tauri, reaproveitando o backend/API existente (`frontend/src-tauri/`). Build de release gera instaladores MSI e NSIS; em dev fala com o backend local, no build final usa o backend publicado (mesmo `.env.production` da web). Ver README § Desktop.

## Fase 11 — Backlog de melhorias futuras
- Comparador de matchups, recomendação de build, filtro por região, histórico de tendência por patch, notificações de mudança de tier, Live Client Data API, cache distribuído (Redis).

---

## Core — Fase 0 (Fundação do modelo de score — numeração de `Core/Estrutura_roadmap/09_BACKLOG.md`)

- [x] 0.1 (parcial) — Pipeline de ingestão: partidas brutas persistidas (`Match`/`MatchParticipant`/`MatchBan`), dedup entre execuções corrigida (checa `match_id` no banco antes do fetch). Ainda falta expansão "bola de neve" por participantes.
- [ ] 0.2 — Identificação de rota com acurácia documentada (hoje usa `teamPosition` da Riot como está, rastreado via `resolution_method`, mas não validado contra os ~95% do Método playrate).
- [x] 0.3 (núcleo) — Schema modelado pela tupla de análise: tabelas `patches`/`matches`/`match_participants`/`match_bans` seguindo `Core/Estrutura_roadmap/15_SCHEMA_DADOS.md`.
- [x] 0.4 — Cache local do Data Dragon por versão (já existia via `target_patch_version` + adapter).
- [x] 0.5 — Camada de acesso a dados (adapters já existiam desde a Fase 1/2 acima).
- [x] 0.6 — Cálculo de baselines (μ, σ) por rota/elo/patch: `app/jobs/compute_baselines.py`, win rate ajustado por Wilson + média/desvio aparados, flag de amostra insuficiente. Testado contra dados reais no Supabase.

## Core — Fase 1 (MVP do score)

- [x] 1.1 — Camada 1, Performance Real (Wilson + normalização): `app/jobs/compute_performance.py`, quarto estágio do pipeline. `Nota_WR`/`Nota_Presenca`/`Nota_KDA`/`performance_score` calculados e persistidos em `champion_performance_scores`. Testado contra dados reais (média geral ~47, ordenação bate com win rate observado). Ainda não exposto via API.
- [x] 1.9 — Testes de contrato de schema do ddragon (já coberto desde a Fase 1 v0 por `backend/tests/test_schema.py`).
- [x] 1.2 — Camada 2, Kit (versão automática): `app/jobs/compute_kit.py`. Confirmado na prática o risco de `13_ESTRATEGIA_DADOS_KIT.md` — `spells[].vars` vem vazio no Data Dragon atual, então `cc_score`/`mobilidade_score` ficam `None` (sem sinal numérico possível); `dano_score`/`resiliencia_score` usam `info.attack`/`info.magic`/`info.defense` (rating oficial da Riot); `alcance_score` por percentil real. 233 campeões processados, incluindo tratamento de campeões com `info` zerado (dado quebrado do ddragon).
- [x] 1.3 — Camada 3, Sinergia de Build: `app/jobs/compute_build.py`. Entropia de Shannon (flexibilidade), dependência de build ótimo (invertida) e power spike de item, suavizados por média móvel de 3 patches com redistribuição proporcional quando falta histórico (`champion_build_patch` + `champion_build_scores`). Validado matematicamente contra um caso real com os 3 patches disponíveis.
- [x] 1.4 — Camada 4, Contexto de Meta: `app/jobs/compute_meta.py`. `Nota_Cobertura` (propriedade do grupo patch/tier/lane, compartilhada entre campeões) + `Nota_Tendencia` (regressão linear do performance_score por campeão, normalizada por percentil). **As 4 camadas do modelo de score existem em código.**
- [x] 1.5/1.6/1.7 — SCORE final + tier (God-E) + indicador de confiança/trava de segurança + selo Trap: `app/jobs/compute_scores.py`, oitavo e último estágio do pipeline. **O pipeline analítico completo da v1 existe em código.** Validado: 0 linhas puladas por camada ausente, selo Trap disparou corretamente (1/135, conferido manualmente), fronteiras de tier testadas. Redistribuição de peso quando Kit não existe pro patch exato (caso de todas as 135 linhas do teste real, já que Kit só foi calculado pra versão mais recente do Data Dragon).
- [x] 1.8 — Interface com filtro por rota e elo: endpoint `GET /scores/champions` (lê só de `champion_scores`, filtros `elo_tier`/`lane`/`patch`, `patch` opcional resolve pro mais recente via `patch_sequence`) + frontend trocado do placar cru v0 pela visão com tier (badge God-E), score final, confiança, marca de tier provisório e selo Trap, com detalhamento por camada (Performance/Kit/Build/Meta) expansível por linha. Validado no navegador contra dados reais do Supabase (filtro de rota, elo sem dados mostrando estado vazio correto, expansão de camadas batendo com os valores da API).

Detalhe completo do que mudou: `Core/Estrutura_roadmap/17_ESTADO_IMPLEMENTADO.md`.
