"""`_fetch_matches_tolerant`: sem rede, sem DB — dublê síncrono de
`riot_api.get_match` bastando pra provar o comportamento de tolerância a
falha (auditoria 16/08, achado verificado direto no código: antes,
`asyncio.gather` sem `return_exceptions=True` derrubava `lookup_player`
inteiro com uma única partida indisponível na Riot)."""

import pytest
from riotwatcher import ApiError

from app.services.player_service import (
    _compute_match_badges,
    _fetch_matches_tolerant,
    _match_impact,
)


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


def _participant(
    puuid: str,
    win: bool,
    kills: int = 0,
    deaths: int = 0,
    assists: int = 0,
    kill_participation: float | None = None,
    team_damage_percentage: float | None = None,
) -> dict:
    challenges = {}
    if kill_participation is not None:
        challenges["killParticipation"] = kill_participation
    if team_damage_percentage is not None:
        challenges["teamDamagePercentage"] = team_damage_percentage
    return {
        "puuid": puuid,
        "win": win,
        "kills": kills,
        "deaths": deaths,
        "assists": assists,
        "challenges": challenges,
    }


def test_match_impact_weighs_kill_participation_and_damage_over_kda():
    """Sprint 4 (16/08): kill_participation/team_damage_percentage já vêm
    normalizados pela Riot em relação ao time — um jogador com poucos
    abates mas presente na maioria das lutas do time deve pesar mais do
    que K/D/A cru sozinho sugeriria."""
    kill_hog = _participant("p1", win=True, kills=8, deaths=5, assists=0)
    team_player = _participant(
        "p2",
        win=True,
        kills=2,
        deaths=1,
        assists=6,
        kill_participation=0.9,
        team_damage_percentage=0.35,
    )
    assert _match_impact(team_player) > _match_impact(kill_hog)


def test_compute_match_badges_picks_best_per_team():
    participants = [
        _participant("winner_low", win=True, kills=1, deaths=2, assists=1),
        _participant("winner_high", win=True, kills=10, deaths=0, assists=5),
        _participant("loser_low", win=False, kills=0, deaths=5, assists=0),
        _participant("loser_high", win=False, kills=6, deaths=3, assists=2),
    ]
    badges = _compute_match_badges(participants, game_duration_s=1500)
    assert badges == {"winner_high": "mvp", "loser_high": "ace"}


def test_compute_match_badges_empty_for_remake():
    """Mesmo piso de `game_duration_s > 300` do Sprint 0 — partida
    encerrada como remake não atribui MVP/ACE."""
    participants = [
        _participant("a", win=True, kills=3),
        _participant("b", win=False, kills=1),
    ]
    assert _compute_match_badges(participants, game_duration_s=180) == {}


def test_compute_match_badges_missing_challenges_defaults_to_zero():
    """Partidas antigas sem `challenges` no payload (a Riot adicionou o
    campo depois) não devem quebrar — só ranqueiam por K/D/A."""
    participants = [
        {"puuid": "a", "win": True, "kills": 5, "deaths": 1, "assists": 2},
        {"puuid": "b", "win": False, "kills": 1, "deaths": 5, "assists": 0},
    ]
    badges = _compute_match_badges(participants, game_duration_s=1500)
    assert badges == {"a": "mvp", "b": "ace"}
