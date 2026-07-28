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

O app publicado só lê do banco (`/champions` e `/stats/champions`) — ele **não** roda o job de coleta nem carrega `RIOT_API_KEY`, para não expor a Development Key em um produto aberto ao público (proibido pela política da Riot). Rode `python -m app.jobs.collect_stats` localmente, apontando `DATABASE_URL` para o Supabase (connection string em modo *Transaction pooler*, porta 6543, pego no painel do Supabase → Project Settings → Database), para popular o banco que o site público lê.

Passos pendentes de configuração manual (não automatizáveis por aqui):
1. Nos projetos `riftforge-api` e `riftforge` na Vercel: Settings → Deployment Protection → desativar "Vercel Authentication" (por padrão as URLs pedem login).
2. No projeto `riftforge-api`: Settings → Environment Variables → adicionar `DATABASE_URL` com a connection string do Supabase, depois redeploy.
