"""`_fetch_matches_tolerant`: sem rede, sem DB — dublê síncrono de
`riot_api.get_match` bastando pra provar o comportamento de tolerância a
falha (auditoria 16/08, achado verificado direto no código: antes,
`asyncio.gather` sem `return_exceptions=True` derrubava `lookup_player`
inteiro com uma única partida indisponível na Riot)."""

import pytest
from riotwatcher import ApiError

from app.services.player_service import _fetch_matches_tolerant


class _FakeResponse:
    def __init__(self, status_code: int):
        self.status_code = status_code


def _api_error(status_code: int) -> ApiError:
    return ApiError(response=_FakeResponse(status_code))


class _FakeRiotApi:
    """`get_match` levanta `ApiError` pros `match_id`s em `failing`,
    devolve um payload mínimo pros demais."""

    def __init__(self, failing: set[str], status_code: int = 404):
        self.failing = failing
        self.status_code = status_code
        self.called_with: list[str] = []

    def get_match(self, match_id: str, continent_region: str | None = None) -> dict:
        self.called_with.append(match_id)
        if match_id in self.failing:
            raise _api_error(self.status_code)
        return {"info": {"metadata": match_id}}


async def test_fetch_matches_tolerant_skips_unavailable_matches():
    riot_api = _FakeRiotApi(failing={"BR1_2"})
    matches = await _fetch_matches_tolerant(
        ["BR1_1", "BR1_2", "BR1_3"], riot_api, continent="americas"
    )
    assert [m["info"]["metadata"] for m in matches] == ["BR1_1", "BR1_3"]


async def test_fetch_matches_tolerant_all_unavailable_returns_empty():
    riot_api = _FakeRiotApi(failing={"BR1_1", "BR1_2"})
    matches = await _fetch_matches_tolerant(
        ["BR1_1", "BR1_2"], riot_api, continent="americas"
    )
    assert matches == []


async def test_fetch_matches_tolerant_reraises_unexpected_exception():
    class _ExplodingRiotApi:
        def get_match(self, match_id: str, continent_region: str | None = None) -> dict:
            raise RuntimeError("bug de verdade, não é indisponibilidade da Riot")

    with pytest.raises(RuntimeError, match="bug de verdade"):
        await _fetch_matches_tolerant(
            ["BR1_1"], _ExplodingRiotApi(), continent="americas"
        )
