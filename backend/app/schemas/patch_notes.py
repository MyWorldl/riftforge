from pydantic import BaseModel


class PatchDeltaRow(BaseModel):
    champion_id: str
    lane: str
    score_anterior: float
    score_atual: float
    delta: float
    tier_anterior: str
    tier_atual: str
    # Posição no ranking por score dentro da própria rota (1 = melhor) —
    # "Variação" em Campeões usa isto, não `delta` (revisão pós-repaginação).
    posicao_anterior: int
    posicao_atual: int
    delta_posicao: int
    # Ajuste 21/08: mesma posição, mas ranqueada por Win/Pick/Ban Rate em
    # vez de score — "Variação" em Campeões passa a refletir a métrica que
    # a tabela está ordenando no momento, não sempre score. `None` quando
    # o campeão não tinha a métrica (sem `ChampionPerformanceScore`) num
    # dos dois patches comparados.
    delta_posicao_win_rate: int | None
    delta_posicao_pick_rate: int | None
    delta_posicao_ban_rate: int | None


class PatchNotesResponse(BaseModel):
    patch_atual: str | None
    patch_anterior: str | None
    altas: list[PatchDeltaRow]
    quedas: list[PatchDeltaRow]
    mudancas_tier: list[PatchDeltaRow]
    comparados: int


class PatchChangeRow(BaseModel):
    champion_id: str
    category: str
    spell_key: str | None
    spell_name: str | None
    field_label: str
    before_value: str
    after_value: str


class PatchChangesResponse(BaseModel):
    patch_atual: str | None
    patch_anterior: str | None
    mudancas: list[PatchChangeRow]
