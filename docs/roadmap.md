# Roteiro de Desenvolvimento — RiftForge

Baseado em `Core/documento_projeto_lol_analyzer.pdf`. Stack: backend Python, frontend web primeiro, desktop depois (reaproveitando o mesmo frontend, ex. via Tauri).

## Fase 0 — Fundação
- [x] Estrutura do repositório (`backend/`, `frontend/`), `.gitignore`, `.env.example`, README.
- [ ] Registrar o projeto no Riot Developer Portal e gerar a Development Key.

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
- [ ] Rate limiting por usuário; configuração via env vars.

## Fase 5 — Frontend Web (MVP)
- [ ] Placar de força dos campeões com filtros por elo/rota/patch.
- [ ] Deploy inicial do MVP.

## Fase 6 — Progressão de chave Riot (em paralelo, a partir da Fase 5)
- [ ] Pedir Personal Key assim que o MVP estiver minimamente funcional.
- [ ] Domínio próprio, Termos de Uso e Política de Privacidade.
- [ ] Submeter pedido de Production Key cedo (~2 semanas de fila).

## Fase 7 — Segurança e conformidade
- [ ] HTTPS obrigatório, criptografia em repouso.
- [ ] Minimização de dados (PUUID), RSO/OAuth se vincular contas.
- [ ] Logs sem dados sensíveis; política de retenção/exclusão (LGPD).

## Fase 8 — Testes e monitoramento contínuo
- [ ] Testes de schema no CI, monitoramento de deprecação de endpoints, alertas de 429.

## Fase 9 — Lançamento público
- [ ] Deploy final após aprovação da Production Key.

## Fase 10 — Evolução para Desktop
- [ ] Empacotar o frontend web com Tauri, reaproveitando o backend/API existente.

## Fase 11 — Backlog de melhorias futuras
- Comparador de matchups, recomendação de build, filtro por região, histórico de tendência por patch, notificações de mudança de tier, Live Client Data API, cache distribuído (Redis).
