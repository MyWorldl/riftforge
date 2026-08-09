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
- [x] Política de retenção/exclusão de PUUID em `match_participants` (rodada 18): `puuid_retention_days` (42 dias, mesmo valor de `ingest_days_window`) + `app/jobs/purge_puuid.py`, rodando diariamente via GitHub Actions. Zera (não deleta) o campo passada a janela de coleta ativa — 10.590 linhas já zeradas em produção. Ver `Core/Estrutura_roadmap/17_ESTADO_IMPLEMENTADO.md` §rodada 18.
- [x] Aviso de não-afiliação com a Riot Games visível na interface (rodapé, `frontend/src/App.tsx`) — item de compliance pendente desde a Fase 6/rodada 4, resolvido na rodada 18.

## Fase 8 — Testes e monitoramento contínuo
- [x] Testes de schema no CI (GitHub Actions, repo https://github.com/MyWorldl/riftforge): roda a cada push/PR em `backend/**` e semanalmente via cron, cobrindo Data Dragon e League-V4/Match-V5 (chave da Riot como secret só na CI).
- [x] Monitoramento de deprecação de endpoints: coberto pela CI semanal acima — falha manda notificação do GitHub pro dono do repo.
- [x] Alertas de 429: sem automação por ora (decisão consciente) — checagem manual via Vercel Runtime Logs, documentado no README § Operação.

## Fase 9 — Lançamento público
- [ ] **Adiado** — Deploy final após aprovação da Production Key. Retomar quando houver interesse em abrir o app ao público em geral.

## Fase 10 — Evolução para Desktop
- [x] Empacotar o frontend web com Tauri, reaproveitando o backend/API existente (`frontend/src-tauri/`). Build de release gera instaladores MSI e NSIS; em dev fala com o backend local, no build final usa o backend publicado (mesmo `.env.production` da web). Ver README § Desktop.

## Fase 11 — Backlog de melhorias futuras
- [x] Comparador de matchups — ver rodada 21 abaixo.
- [x] Recomendação de build (itens/runas) — ver rodada 21 abaixo.
- [x] Notificação de mudança de tier após patch — ver rodada 21 abaixo.
- [x] Histórico de tendência por patch — item 3.4, já entregue (`GET /scores/history`).
- [x] Rubrica manual de Kit — lote piloto (10 campeões, eixos CC/Mobilidade). Ver rodada 22 abaixo.
- [x] Paralelização do crawler (item 6.2) — ver rodada 22 abaixo.
- Filtro por região/servidor amplo (Campeões só tem Brasil funcional hoje), Live Client Data API, cache distribuído (Redis) — adiado, sem tráfego que justifique hoje.

---

## Core — Fase 0 (Fundação do modelo de score — numeração de `Core/Estrutura_roadmap/09_BACKLOG.md`)

- [x] 0.1 (parcial) — Pipeline de ingestão: partidas brutas persistidas (`Match`/`MatchParticipant`/`MatchBan`), dedup entre execuções corrigida (checa `match_id` no banco antes do fetch). Ainda falta expansão "bola de neve" por participantes.
- [x] 0.2 — Identificação de rota validada (rodada 18): `app/jobs/validate_route_identification.py` compara `teamPosition` contra o Método 1 (Role+Lane, `raw_role`/`raw_lane`) em produção — 82,8% de concordância geral; investigação por campeão nas zonas de discordância (Jungle 58,3%, Top 79,8%) mostra que `teamPosition` corrige uma fraqueza conhecida do campo raw `lane`, não o contrário. `teamPosition` mantido como fonte de rota; Método 2 (playrate) não implementado — seria circular validar contra ele sem gabarito independente.
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

## Core — Fase 3 (Diferenciais competitivos)

- [x] 3.1 — Explicabilidade por camada (**principal diferencial do produto** segundo `09_BACKLOG.md` §Fase 3): `backend/app/core/explain.py` decompõe o score final em contribuições por camada — `contribuicao_i = peso_normalizado_i * (nota_i − 50)`, com `50 + Σ contribuições = score_final` como identidade exata. Exposto no campo `explicacao` de `GET /scores/champions` e renderizado no frontend como painel com frase em linguagem natural ("Performance puxa para cima; Build é o que mais segura"), barras divergentes por camada e a conta fechando de 50.0 até o score final. Camadas ausentes (ex: Kit sem dado pro patch) são declaradas explicitamente, com aviso de que o peso foi redistribuído.
- [x] 3.2 — Distinção visual entre poder estrutural (Kit+Build) e poder emprestado do meta (Performance+Meta): `app/core/power_profile.py`, campo `perfil_poder` em `GET /scores/champions`. Badge na coluna "Perfil" da tabela + detalhamento com duas barras no painel "Por quê?". Usa os pesos reais (`pesos_usados`), não os nominais.
- [x] 3.3 — Etiqueta de Skill Expression (floor/ceiling): heurística v1 (`app/jobs/compute_skill_expression.py`, ver rodada de 2026-08-02 abaixo), integrada em `GET /scores/champions`.
- [x] 3.4 — Histórico de evolução do campeão entre patches (gráfico): endpoint `GET /scores/history` (ordena por `patch_sequence`, não pela string do patch) + gráfico SVG na interface (`HistoryChart.tsx`), acessível pelo botão "Histórico" ao lado de "Por quê?". Linhas de grade nas fronteiras de tier (God/S/A/B/C/D), pontos coloridos por tier com opacidade proporcional à confiança (mesma trava do backend tornada visível), tooltip por ponto.
- [x] 3.5 — Comparador de matchups dedicado: `GET /matchups` (ver rodada de 2026-08-02 abaixo), painel expansível na tabela de Campeões.

## Coleta em volume (2026-07-30)

Primeira coleta real: **15 → ~5.100 partidas** (Gold I–IV), gerando 5.416 linhas de score. Três correções saíram de medição, não de suposição:

- **Janela de tempo na ingestão** (`--since-days`, padrão 42): sem ela, as partidas caíam em 38 patches com só 24% no mais recente — ~76% da cota da Riot ia para patches que nenhuma consulta alcança.
- **Camada 2 (Kit) ativada**: só existia para 16.15 (3,2% do dado), então 25% do peso do modelo nunca tinha influenciado score nenhum. Agora cobre 16.10–16.15 a 100%.
- **Ingestão resiliente**: sessão por invocador (o Supabase derrubava a conexão em execuções longas) e falha isolada por invocador.

Validado com o volume: a trava de segurança rebaixou 70 linhas da faixa S para A (ramo que nunca tinha rodado com dado real), o selo Trap saiu de 1 para 248, e o topo do quadro ficou plausível.

**Limite conhecido:** todo tier segue provisório — a melhor combinação chega a 10,1% de confiança contra um piso de 30%. Chegar lá exige ~1,5 h de coleta *dentro* da janela de ~2 semanas do patch. Ver `Core/Estrutura_roadmap/17_ESTADO_IMPLEMENTADO.md` §rodada 12.

Detalhe completo do que mudou: `Core/Estrutura_roadmap/17_ESTADO_IMPLEMENTADO.md`.

## Home multi-página, Análise do Jogador e Classificações (2026-07-31)

Pedido do usuário a partir de um wireframe: transformar a tela única de
campeões numa Home com navegação (nav + hero + busca de jogador) e três
páginas novas. Detalhe completo em `Core/Estrutura_roadmap/17_ESTADO_IMPLEMENTADO.md`
§rodada 19; resumo:

- **Frontend virou multi-página** (`react-router-dom`, `HashRouter`): Home
  (hero + busca), Campeões (tela de antes, sem mudança de comportamento),
  Classificações, Análise do Jogador, Patch Notes, Desktop.
- **Análise do Jogador** (`GET /player/lookup`, novo): busca sob demanda
  por Riot ID via Account-V1 + Match-V5. Único endpoint novo que faz
  chamada Riot em tempo real por requisição — **bloqueado em produção até
  a Production Key ser aprovada**, mesmo gate dos `/riot/*` já existentes.
  Funciona hoje em desenvolvimento local.
- **Classificações** (`GET /rankings`, novo): ranking das ligas apex
  (Desafiante/Grão-Mestre/Mestre) direto da Riot — sem inventar conceito
  de classificação. Coletado por job batch (`app/jobs/collect_rankings.py`,
  integrado ao workflow diário), o backend público só lê do banco — **não
  precisa esperar a Production Key**, ao contrário do item acima.
- **Patch Notes** (`GET /patch-notes`, novo): maiores altas/quedas de
  score entre os dois patches mais recentes, derivado do próprio modelo —
  não reproduz o texto oficial da Riot (direitos autorais).

## Ajustes de UX no Rankings (2026-07-31)

Feedback do usuário sobre a página recém lançada. Detalhe completo em
`Core/Estrutura_roadmap/17_ESTADO_IMPLEMENTADO.md` §rodada 20; resumo:

- Título da página: "Classificações" → "Rankings" (rota mantida).
- Filtro por região (BR/NA/EUW/KR — só as principais, decisão deliberada
  pra não multiplicar demais a cota da Riot do job de coleta) e filtro
  "Todos os tiers" (combina Desafiante/Grão-Mestre/Mestre).
- Busca por nome de jogador (client-side, sobre os dados já carregados).
- Coluna "Taxa de Vitória" combinando o que eram duas colunas separadas
  (vitórias/derrotas e %) num formato só ("380/323 - 54%").
- Colunas novas: Nível e ícone de invocador (Data Dragon), via Summoner-V4.
- `rankings_top_n_per_tier` reduzido de 50 pra 20 pra compensar o job agora
  cobrir 4 regiões em vez de 1 — mesmo tempo total, aproximadamente.

Suite de testes: 51 → 56. `tsc -b`/`lint`/`build` do frontend limpos.

## Matchups, Build recomendado, Skill Expression, Notificação de tier (2026-08-02)

Pedido do usuário: implementar de uma vez os 4 itens do backlog (Fase 3/4)
que ainda não tinham sido iniciados. Todos reaproveitam dado já coletado
(`match_participants`), sem nenhuma chamada Riot nova:

- **Matchups** (`GET /matchups`, novo): "campeão A vs. todos os B" na
  mesma rota, casando adversários dentro da mesma partida por
  `(match_id, resolved_position)`. `app/jobs/compute_matchups.py`.
- **Build recomendado** (`GET /builds/recommended`, novo): item build e
  combinação de runas com maior win rate observado, por
  `(patch, tier, lane, campeão)`. Runas nunca tinham sido capturadas —
  `app/jobs/backfill_participant_runes.py` extraiu de `matches.raw_payload`
  já persistido (zero chamada Riot nova); `ingest_matches.py` grava daqui
  pra frente. `app/jobs/compute_build_recommendation.py`. Novos proxies
  `GET /items`/`GET /runes` (mesmo padrão de `/champions`) resolvem
  nome/ícone no frontend.
- **Skill Expression** (floor/ceiling, integrado em `/scores/champions`):
  heurística v1 declarada (não é métrica oficial da Riot) baseada na
  variação de KDA por partida — `app/jobs/compute_skill_expression.py`.
- **Notificação de mudança de tier**: extensão de `patch_diff.py`/
  `GET /patch-notes` já existentes (campo `mudancas_tier`) — sem sistema
  de conta no projeto, vira seção visível na página de Patch Notes, não
  notificação push/e-mail.

UX: Matchups e Build viraram mais dois botões expansíveis na tabela de
Campeões (mesmo padrão de "Por quê?"/"Histórico"), não páginas novas —
decisão confirmada com o usuário antes de implementar.

Achado técnico: o primeiro backfill de runas (loop em Python buscando
`raw_payload` por página) travava contra o pooler do Supabase sem nem
lançar exceção. Resolvido reescrevendo como um único `UPDATE ... FROM`
em SQL puro (extração de JSON inteira dentro do Postgres) — de horas
estimadas pra segundos na prática.

Validado com dados reais do Supabase: 31.762 linhas de matchup, 5.560 de
build recomendado, 5.560 de Skill Expression. Suite de testes: 63 → 71.
`tsc -b` do frontend limpo. Painéis conferidos no navegador contra dados
reais (imagens de item/runa carregando, seção de mudança de tier
renderizando).

## Rotação de credenciais, rubrica de Kit (piloto) e paralelização do crawler (2026-08-02)

**Segurança**: a Riot API Key e a senha do Postgres/Supabase já tinham
circulado em texto puro fora do `.env` várias vezes durante o
desenvolvimento — rotacionadas as duas. Achado no processo: o Supabase
bloqueia `ALTER ROLE postgres` via SQL direto ("only superusers can alter
privileged roles") — a troca de senha do banco só é possível pelo
dashboard (Project Settings → Database), não por automação via API/SQL.
Sequência aplicada: nova senha → `.env` local → secret do GitHub Actions
→ env var da Vercel + redeploy, nessa ordem pra minimizar a janela de
indisponibilidade. Confirmado sem outage real desta vez (diferente do
incidente da rodada anterior).

**Rubrica manual de Kit** (backlog 5.1): lote piloto de 10 campeões
tagueados nos eixos CC e Mobilidade (os dois que a v1 automática do Kit
deixa `None` — Data Dragon não expõe esse sinal, ver
`Core/13_ESTRATEGIA_DADOS_KIT.md`), seguindo a rúbrica de âncoras 0-10 de
`Core/14_RUBRICA_KIT_CAMPEOES.md`. Notas fundamentadas nas descrições
reais de habilidade do Data Dragon (não só conhecimento prévio — o jogo
já teve patches depois do corte de conhecimento do modelo). Dados em
`backend/data/kit_manual_tags.json` (versionado em texto, não numa
tabela — mais fácil de revisar num diff do que numa linha de banco
opaca), consumido por `compute_kit.py`: quando o campeão tem tag manual,
`cc_score`/`mobilidade_score` deixam de ser `None` e `kit_score`
recalcula com os 5 eixos completos em vez de 3. Resto do elenco
(~160 campeões) continua no automático até ser tagueado — escala
incrementalmente, não bloqueia o pipeline.

**Paralelização do crawler** (backlog 6.2): `ingest_matches.py` processava
invocadores um de cada vez; agora usa `ThreadPoolExecutor`
(`settings.ingest_concurrency`, padrão 5). Seguro porque o limitador de
taxa da RiotWatcher usa locks internos e uma única instância de
`RiotApiAdapter`/`requests.Session` compartilhada entre as threads (session
do `requests` é thread-safe pra esse uso). Cada invocador mantém sua
própria sessão de banco, mesmo princípio de antes da paralelização.
Testado contra o Supabase real com partidas genuinamente novas (elo Prata,
não coberto pela coleta diária) — ingestão concorrente confirmada nos
logs (threads intercaladas), sem erro de rate limit.

Redis (item 6.1) ficou de fora por decisão: o próprio backlog marca como
"só relevante se o uso crescer", e hoje não há tráfego que justifique.

Suite de testes: 71 → 72.

## Execução da revisão técnica externa (2026-08-02)

Pedido do usuário: plano de ação para **todos** os pontos das seções 0-5
de `Core/Revisao_2026-08-02_RiftForge.md` (documento de auditoria
automática, baseline de 61 testes) e execução de todos — seções 6
(gaps de feature nova) e 7 (design/acessibilidade) ficaram fora de
escopo por instrução explícita dele. ~25 achados, divididos em 7 lotes
executados em sequência; detalhe completo por lote em
`Core/Estrutura_roadmap/17_ESTADO_IMPLEMENTADO.md` §rodada 23. Resumo:

- **Lote A (segurança rápida):** PUUID removido do payload de
  `/rankings`/`/player/lookup`; `raw_payload` sanitizado (guardava PUUID/
  Riot ID de todo participante desde a Fase 0, sobrevivendo à retenção da
  rodada 18); CORS restrito a `Content-Type`.
- **Lote B (refactor estrutural, item 4.1):** `app/main.py` (704 linhas)
  virou composição pura — rotas/services/repositories/schemas em
  módulos próprios, as 4 camadas completas (escolha explícita do
  usuário sobre uma versão mais enxuta de 2 camadas). Cache do Data
  Dragon, `Cache-Control` nas rotas só-leitura, N+1 de `/player/lookup`
  resolvido, `explicacao`/`perfil_poder` viraram endpoint próprio sob
  demanda.
- **Lote C:** 16 testes de rota HTTP novos (fixture de SQLite in-memory +
  `TestClient`), CI dividido em job `unit` (todo push) e `integration`
  (só no cron semanal, com a chave da Riot).
- **Lote D:** validação de `version_label` na ingestão, 3 índices novos,
  `AbortController` nos filtros de Campeões/Rankings/Patch Notes.
- **Lote E (observabilidade Nível 1):** `structlog` em JSON substituindo
  todo `print()` dos jobs, `correlation_id` por request e por execução de
  job, `GET /health` real (testa o banco, idade do dado), métricas no-op
  prontas pra Datadog (Nível 2, fora de escopo — sem conta disponível).
- **Lote F (segurança + CI):** rate limit por `X-Forwarded-For`
  (Vercel fica atrás de proxy), CSP do app desktop, headers de segurança
  na API, checksum SHA-256 dos instaladores, `ruff` no CI, workflow de
  frontend novo (`oxlint` + `tsc -b`/build) — nenhum dos dois existia
  antes.
- **Lote G (features atuais):** Campeões ganhou busca por nome,
  ordenação por coluna e comparador lado a lado (até 3 campeões) — todos
  sobre dado já carregado, sem fetch extra; mini-barra de contribuição
  por camada, reaproveitando os 4 scores que a linha já tinha. Rankings
  ganhou variação de posição (▲/▼) desde a última coleta. Análise do
  Jogador passou a comparar contra a baseline de win rate do elo e a
  detectar o elo real via League-V4 em vez de assumir GOLD fixo. Patch
  Notes cruza no frontend as mudanças brutas da Riot com o impacto de
  score já calculado.

Achado de segurança fechado no processo: a rotação de credenciais da
rodada anterior (Riot Key + senha do Postgres) foi confirmada e mantida —
nenhuma credencial nova precisou ser exposta pra este trabalho.

Suite de testes: 72 → 88. `ruff check .`, `tsc -b`, `npm run build` e
`npm run lint` (oxlint — roda no CI Linux; localmente bloqueado por
política de Controle de Aplicativo do Windows nesta máquina, não é um
problema do código) todos limpos.

## Página de detalhe por campeão e "Variação" em Campeões (2026-08-08)

Depois de ver a tabela de Campeões na tela real, o usuário reportou a
coluna de Ações cortada (a mini-barra de composição do Lote G tinha
apertado demais a linha) e sugeriu, com screenshots do OP.GG como
referência, mover parte do conteúdo pra uma página própria por campeão.
Três rodadas de ajuste até o formato final — detalhe completo em
`Core/Estrutura_roadmap/17_ESTADO_IMPLEMENTADO.md` §rodada 24. Resumo:

1. **Correção de layout:** `.table-scroll`/`.center` tinham teto de
   largura menor do que a tabela (com comparador + composição do Lote G)
   passou a precisar — `.center-wide` (1320px, só em Campeões) resolveu.
2. **Página de detalhe** (`/campeoes/:championId`, `ChampionDetailPage.tsx`,
   nova): Explicação/Histórico/Matchups/Build viraram abas, reaproveitando
   os componentes que já existiam. Comparador extraído pra um módulo
   compartilhado (`components/championDisplay.tsx`) usado tanto na lista
   quanto na página nova.
3. **Segunda rodada:** coluna "Variação" na lista (delta de score vs.
   patch anterior, reaproveita `patch_diff.py`); ícones de Matchups/Build
   removidos da lista (redundantes com a página); cabeçalho da página
   reformulado estilo OP.GG (retrato+nome+habilidades à esquerda — novo
   endpoint `GET /champions/{id}` pra Q/W/E/R —, taxas+score à direita);
   nova aba "Comparar" na página (mesmo comparador da lista, começando
   com o próprio campeão selecionado).
4. **Terceira rodada:** Explicação/Histórico voltaram a expandir inline
   na lista (só Matchups/Build/Comparar ficam na página); "Composição"
   renomeada pra "Score"; badge de tier do cabeçalho da página reduzido e
   o asterisco de tier provisório removido de lá (mantido na lista).

Nenhuma mudança de schema ou lógica de cálculo — só reorganização de
frontend e um endpoint novo (proxy fino do Data Dragon, mesmo padrão de
`/champions`/`/items`/`/runes`). `tsc -b`/`npm run build` limpos e
verificação manual no navegador a cada uma das 3 rodadas.

## Seções 6-7 da revisão técnica: gaps de feature, acessibilidade, SEO, paleta e responsividade (2026-08-08)

Pesquisa prévia (3 agentes em paralelo) mostrou que o filtro de região
completo — citado junto no pedido original como item de backlog — é uma
migração de arquitetura (nenhuma das 9 tabelas do pipeline de score tem
coluna de região), não um ajuste de UI; ficou de fora deste lote, a
decidir como plano próprio depois. O resto das seções 6-7 do documento
de revisão (`Core/Revisao_2026-08-02_RiftForge.md`) foi entregue em 5
lotes pequenos e independentes, cada um verificado e pushado em
separado — detalhe completo em `17_ESTADO_IMPLEMENTADO.md` §rodada 25:

- **Lote H (gaps de feature):** widget "Melhores altas do patch" +
  "Cobertura de meta por rota" na Home (novo `GET /meta/coverage`, dado
  já calculado pela Camada 4); filtro por classe em Campeões
  (`ChampionMeta.tags`, já buscado e nunca usado); dropdown de Tier
  desabilita elos sem dado coletado (só GOLD hoje).
- **Lote I (acessibilidade):** `FlagSelect` navegável por teclado
  (padrão ARIA "select-only combobox"); `role="status"`/`role="alert"`
  nos estados de carregamento/erro; `ErrorBoundary` global.
- **Lote J (idioma/SEO):** `lang="pt-BR"` (era `"en"`), meta description
  e Open Graph estáticos, `<title>` por rota.
- **Lote K (paleta/assets):** hex hardcoded viraram variáveis CSS
  (`--ring-win`/`-loss`, `--layer-kit`/`-build`/`-meta`); corrigido bug
  real do badge "Trap" não acompanhar o tema escuro; `--tier-d`/`-e`
  mais distinguíveis; assets mortos removidos; ícones de tier saíram do
  bundle JS pra `public/tiers/`.
- **Lote L (responsividade):** tokens de espaço/raio/texto; 3
  breakpoints (768/1024/1280px) verificados por medição de
  `scrollWidth`/`clientWidth` (não só inspeção visual) nas 7 páginas —
  achou e corrigiu 3 bugs reais de overflow horizontal que a inspeção
  visual sozinha deixaria passar (`.top-bar` sem `flex-wrap`, afetando
  *toda* página no celular; `.role-filter` do Lote H; grid da aba
  Matchups). Tabelas continuam com scroll horizontal, agora com um
  gradiente sutil reforçando que rolam.

`ruff check .`, `tsc -b`, `npm run build` e `npm run lint` limpos a cada
lote; suite de testes do backend +2 (92 no total). Cada lote testado
contra o backend local rodando com o Supabase de produção antes do
commit, com confirmação explícita do usuário antes de cada push.

## Filtro de região completo — piloto BR1 + EUW1 (2026-08-09)

O item deixado de fora da seção anterior (migração de arquitetura, não
ajuste de UI) virou plano próprio, aprovado e executado em 8 lotes
(M-T) — detalhe completo em `Core/Estrutura_roadmap/17_ESTADO_IMPLEMENTADO.md`
§rodada 26. Resumo do resultado:

- **Alembic** entra como primeira ferramenta de migração de schema do
  projeto (antes só `create_all()`, que nunca altera tabela existente) —
  vira o mecanismo padrão para toda mudança de schema futura, não só
  esta.
- **12 tabelas do pipeline de score** ganharam coluna `region` (as 2
  tabelas só-Data-Dragon, `ChampionKitScore`/`ChampionPatchChange`,
  ficaram de fora por não terem dado de partida).
- **euw1** ligado como região piloto ao lado de `br1` — escolhida por
  ficar num bucket de cota Match-V5 totalmente separado
  (`br1`→`americas`, `euw1`→`europe`), provando paralelismo real de
  cota. Verificado em produção: 229 partidas ingeridas, prefixo
  `EUW1_...` confirmando o roteamento de região, 706 `ChampionScore`
  calculados com distribuição de tier saudável, zero erro/429 no
  primeiro disparo supervisionado.
- **Frontend:** dropdown de região agora habilita `br1` + `euw1` (as
  outras 6 seguem "em breve"); corrigido de passagem um bug real
  pré-existente — o filtro de região da tela de Campeões nunca havia
  chegado a ser enviado ao backend.
- **Região #3 em diante é só configuração** (4 passos, nenhum toca
  `app/jobs/`, `app/api/` ou `app/repositories/`) — checklist completo
  em `17_ESTADO_IMPLEMENTADO.md` §rodada 26.

+6 testes novos (região em ingestão + isolamento de região na API);
`pytest`/`ruff check .`/`tsc -b`/`npm run build`/`npm run lint` limpos a
cada lote. Cada lote de backend verificado contra o Supabase de
produção real antes do commit; o lote de CI (euw1 real) verificado por
disparo manual com cota reduzida antes de liberar o cron diário —
confirmação explícita do usuário antes de cada push.

## Recomendação de Campeão v0+v1 (2026-08-09)

`Core/Revisao_2026-08-02_RiftForge.md` §6 (Tier 2) listava "recomendação
de campeão" como item de alto valor nunca construído, com um caminho
v0→v1→v2. **v2 (contrapick) já tinha saído de escopo antes deste plano
começar** — já existe desde a rodada 21 como a aba Matchups da página de
detalhe do campeão. Este trabalho cobriu só v0+v1, em 4 lotes (U-X),
detalhe completo em `Core/Estrutura_roadmap/17_ESTADO_IMPLEMENTADO.md`
§rodada 27:

- **v0 (filtro inteligente):** nova página `/recomendacao` — rota + elo
  + região + tier mínimo filtram `/scores/champions` (já existente),
  ordenado por `score_final`. Sem filtro de "poder estrutural vs. meta"
  de propósito — exigiria reintroduzir um campo (`pesos_usados`) que uma
  revisão anterior já tinha removido do payload em lote por custo.
- **v1 (perfil de jogo):** endpoint novo `GET /scores/kit-profile`
  (trio dedicado, `ChampionKitScore` não tem elo/rota/região como
  `ChampionScore` tem) expõe os eixos 0-10 de Dano/Alcance/Resiliência
  por campeão. Toggle "usar perfil de jogo" (default desligado) +
  3 sliders reordenam por distância euclidiana aos eixos declarados —
  quem não tem Kit calculado pro patch cai no fim da lista, não some.
- Nenhuma mudança de schema, job ou CI — trabalho 100% aditivo do lado
  de leitura, reaproveitando o motor de score já existente.
- Verificação contra o Supabase de produção pegou um bug real antes do
  próximo lote: `SELECT DISTINCT` com `ORDER BY` em coluna fora da
  lista quebra no Postgres (SQLite deixava passar nos testes).

+4 testes novos (`/scores/kit-profile`); `pytest`/`ruff check .`/
`tsc -b`/`npm run build`/`npm run lint` limpos a cada lote. Verificado
no navegador contra dado real: filtro de tier mínimo nos dois extremos
(`E` retorna todo mundo, `GOD` retorna vazio sem quebrar), toggle de
perfil de jogo reordenando de verdade (maximizar Dano sobe assassinos/
lutadores conhecidos), link de cada resultado abrindo a página de
detalhe com os parâmetros certos.
