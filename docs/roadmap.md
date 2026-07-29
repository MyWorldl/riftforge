# Roteiro de Desenvolvimento — RiftForge

Baseado em `Core/documento_projeto_lol_analyzer.pdf`. Stack: backend Python, frontend web primeiro, desktop depois (reaproveitando o mesmo frontend, ex. via Tauri).

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
- [x] Job periódico que popula o banco a partir da Riot API (`app/jobs/collect_stats.py`).

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
