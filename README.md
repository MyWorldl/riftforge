# RiftForge

Aplicação de análise de campeões de League of Legends: ranqueia e compara campeões por patch, elo, rota e período, combinando dados estáticos (Data Dragon) com dados reais de partidas (Riot API).

Especificação base do projeto: `../Core/documento_projeto_lol_analyzer.pdf`.
Roteiro de fases: [docs/roadmap.md](docs/roadmap.md).

## Estrutura

- `backend/` — API em Python (FastAPI). Isola todo acesso a Data Dragon e Riot API atrás de adapters, agrega dados de partidas em um banco próprio e serve o frontend.
- `frontend/` — Web app (Vite + React + TypeScript).

## Como rodar (desenvolvimento)

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Chave da Riot API

Comece com uma **Development Key** (expira a cada 24h, só para testes) em https://developer.riotgames.com. Nunca a exponha no frontend — todas as chamadas passam pelo backend. Veja `docs/roadmap.md` para a progressão até Personal e Production Key.

## Deploy (Vercel + Supabase)

- **Backend**: projeto Vercel `riftforge-api` (Python serverless, `backend/vercel.json` + `backend/api/index.py`). URL estável: `https://riftforge-api-datadog-monitors.vercel.app`.
- **Frontend**: projeto Vercel `riftforge` (Vite estático). URL estável: `https://riftforge-datadog-monitors.vercel.app`. `VITE_API_URL` já vem apontando para o backend acima via `frontend/.env.production` (é uma URL pública, não é segredo).
- **Banco**: Postgres no Supabase, projeto `riftforge` (ref `nitayvxvoojpahwvtohz`), com as tabelas de `app/db/models.py` já criadas via migration.

O app publicado só lê do banco (`/champions` e `/stats/champions`) — ele **não** roda o job de coleta nem carrega `RIOT_API_KEY`, mesmo com a Personal Key aprovada: chaves de desenvolvimento/pessoais não devem ficar em produto aberto ao público, só a Production Key justificaria isso (fora de escopo por ora — ver `docs/roadmap.md`). Rode `python -m app.jobs.collect_stats` localmente, apontando `DATABASE_URL` para o Supabase (connection string em modo *Transaction pooler*, porta 6543, pego no painel do Supabase → Project Settings → Database), para popular o banco que o site público lê.

## CI

Repositório: https://github.com/MyWorldl/riftforge (privado). GitHub Actions (`.github/workflows/backend-tests.yml`) roda os testes do backend a cada push/PR em `backend/**` e também semanalmente (segunda-feira, cron), para pegar deprecações do lado da Riot mesmo sem push novo. A chave da Riot está configurada como secret (`RIOT_API_KEY`) só para a CI validar League-V4/Match-V5 de verdade — nunca é usada em produção.

## Operação

- **Rate limit (429)**: para checar se o backend público está batendo no limite (10/min nos endpoints `/riot/*`, 60/min nos demais), veja Vercel → projeto `riftforge-api` → Observability/Runtime Logs, filtrando por status 429. Sem alerta automático configurado por ora — checagem manual quando desconfiar de tráfego alto.
- **Deprecação de endpoints da Riot**: os testes de schema (Data Dragon e League-V4/Match-V5) já pegam isso automaticamente via CI semanal. Se a Action falhar, o GitHub notifica por e-mail o dono do repositório.
