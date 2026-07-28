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
