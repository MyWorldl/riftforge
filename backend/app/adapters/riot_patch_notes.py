"""Adapter pra nota oficial de patch da Riot (leagueoflegends.com) —
pedido do usuário depois de descobrir que o diff bruto do Data Dragon
(`patch_notes_diff.py`) tanto inventava mudanças falsas (habilidade
migrada pro sistema de variáveis nomeadas, valor zera/reescala sem
relação com o jogo de verdade) quanto perdia campeões inteiros (Locke:
Q/W mudaram de verdade, mas o Data Dragon público não expõe esse valor
pra esse kit). A nota oficial não tem esse problema — é texto escrito
por humano, com o valor de antes/depois real.

Fonte não é a API pública documentada (`developer.riotgames.com`) — é o
payload JSON (`__NEXT_DATA__`, Next.js) por trás da própria página do
site institucional. Funciona hoje (confirmado contra o patch real),
mas pode quebrar se a Riot redesenhar o template — diferente da Data
Dragon, que é oficialmente mantida pra esse fim. Por isso
`compute_patch_changes.py` trata isso como fonte PRIMÁRIA com fallback
pro diff antigo (`patch_notes_diff.py`) se a busca falhar, em vez de
dependência única.

O parser de verdade (`app/core/riot_patch_notes_parser.py`) é função
pura, sem rede — este módulo só busca o HTML e entrega pra ele."""

import asyncio
import json
import re

import httpx

_TIMEOUT = httpx.Timeout(15.0, connect=10.0)
_RETRIES = 3
_RETRY_BACKOFF_S = 1.5

_PATCH_NOTES_LIST_URL = "https://www.leagueoflegends.com/en-us/news/tags/patch-notes/"
_PATCH_NOTES_BASE_URL = "https://www.leagueoflegends.com"
_USER_AGENT = (
    "Mozilla/5.0 (compatible; RiftForge/1.0; +https://github.com/MyWorldl/riftforge)"
)

_NEXT_DATA_RE = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)


class RiotPatchNotesAdapter:
    async def _get_html(self, url: str) -> str:
        # Mesmo padrão de retry de `DataDragonAdapter._get_json` — 5xx
        # transitório tenta de novo, erro de rede tenta de novo, 4xx real
        # propaga na primeira tentativa.
        last_error: Exception | None = None
        async with httpx.AsyncClient(
            timeout=_TIMEOUT, headers={"User-Agent": _USER_AGENT}, follow_redirects=True
        ) as client:
            for attempt in range(_RETRIES):
                try:
                    response = await client.get(url)
                    response.raise_for_status()
                    return response.text
                except httpx.TransportError as exc:
                    last_error = exc
                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code < 500:
                        raise
                    last_error = exc
                if attempt < _RETRIES - 1:
                    await asyncio.sleep(_RETRY_BACKOFF_S * (attempt + 1))
        # Sprint 6 (mypy): mesma prova de inalcançável de DataDragonAdapter.
        assert last_error is not None
        raise last_error

    async def _get_next_data(self, url: str) -> dict:
        html = await self._get_html(url)
        match = _NEXT_DATA_RE.search(html)
        if not match:
            raise ValueError(f"__NEXT_DATA__ não encontrado em {url}")
        return json.loads(match.group(1))

    async def find_patch_notes_url(self, ddragon_version: str) -> str | None:
        """`ddragon_version` no formato "16.15" ou "16.15.1" — a Data
        Dragon numera diferente do site institucional (achado: "16.15"
        vira "Patch 26.15" na nota oficial, offset de +10 no major,
        verificado contra o índice real de +170 notas). Confirma o
        título exato no índice em vez de só confiar na fórmula — se a
        Riot mudar o esquema de novo, isso falha de forma visível
        (`None`) em vez de montar uma URL errada."""
        parts = ddragon_version.split(".")
        major, minor = int(parts[0]), int(parts[1])
        expected_title = f"patch {major + 10}.{minor} notes"

        data = await self._get_next_data(_PATCH_NOTES_LIST_URL)
        blades = data["props"]["pageProps"]["page"]["blades"]
        grid_blade = next(
            (b for b in blades if b.get("type") == "articleCardGrid"), None
        )
        if grid_blade is None:
            return None

        for item in grid_blade.get("items", []):
            title = item.get("title", "")
            if expected_title in title.lower():
                url = item.get("action", {}).get("payload", {}).get("url")
                if url:
                    return f"{_PATCH_NOTES_BASE_URL}{url}"
        return None

    async def get_champions_section_html(self, patch_notes_url: str) -> str:
        """Corpo HTML completo da nota (todas as seções — Champions,
        Items, Runes, ARAM, Arena...). O parser (`riot_patch_notes_parser
        .parse_champions_section`) que recorta só a seção "Champions" —
        pedido do usuário: nada de Arena/ARAM/TFT, que reaproveitam os
        mesmos nomes de campeão em outro contexto."""
        data = await self._get_next_data(patch_notes_url)
        blades = data["props"]["pageProps"]["page"]["blades"]
        rich_text_blade = next((b for b in blades if "richText" in b), None)
        if rich_text_blade is None:
            raise ValueError(f"Bloco richText não encontrado em {patch_notes_url}")
        return rich_text_blade["richText"]["body"]
