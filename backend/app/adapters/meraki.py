"""Adapter for Meraki Analytics' community-curated champion attribute
ratings (`cdn.merakianalytics.com`) — Sprint 5 (16/08), fonte de CC/
Mobilidade pro resto do elenco sem tag manual em `data/kit_manual_tags.json`
(ver Core/Estrutura_roadmap/13_ESTRATEGIA_DADOS_KIT.md).

Curadoria comunitária (não dado oficial da Riot nem gerado por nós):
validado antes de integrar ao pipeline (auditoria 16/08) contra os 10
campeões já tagueados manualmente — correlação de Spearman ≈ 0,87 em CC e
em Mobilidade, consistente com a estimativa já registrada no plano. Também
confirmado ao vivo que a curadoria atrasa em relação ao patch mais recente
da Riot (um campeão visto em partida real de produção não estava no
dataset ainda) — por isso 404 é tratado como "sem dado" (`None`), nunca
como erro: é o caso esperado pra campeão muito recente, não uma falha."""

import asyncio

import httpx

_BASE_URL = "https://cdn.merakianalytics.com"
# Mesmos valores de DataDragonAdapter — 404 real (campeão fora do dataset,
# esperado) propaga na primeira tentativa; só timeout/5xx transitório tenta
# de novo.
_TIMEOUT = httpx.Timeout(15.0, connect=10.0)
_RETRIES = 3
_RETRY_BACKOFF_S = 1.5


class MerakiAdapter:
    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = base_url or _BASE_URL

    async def get_champion_attribute_ratings(self, champion_id: str) -> dict | None:
        """`champion_id` é o mesmo `id` do Data Dragon — confirmado que a
        Meraki usa o identificador oficial da Riot como nome de arquivo
        (ex: "MonkeyKing" pro Wukong), sem tabela de mapeamento própria
        necessária. Devolve o dict `attributeRatings` bruto (escala 0-3 por
        eixo: damage/toughness/control/mobility/utility, mais
        abilityReliance/difficulty em outra escala) — a normalização pra
        escala 0-10 do projeto fica pro chamador."""
        url = f"/riot/lol/resources/latest/en-US/champions/{champion_id}.json"
        last_error: Exception | None = None
        async with httpx.AsyncClient(
            base_url=self._base_url, timeout=_TIMEOUT
        ) as client:
            for attempt in range(_RETRIES):
                try:
                    response = await client.get(url)
                    if response.status_code == 404:
                        return None
                    response.raise_for_status()
                    return response.json().get("attributeRatings")
                except httpx.TransportError as exc:
                    last_error = exc
                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code < 500:
                        raise
                    last_error = exc
                if attempt < _RETRIES - 1:
                    await asyncio.sleep(_RETRY_BACKOFF_S * (attempt + 1))
        raise last_error
