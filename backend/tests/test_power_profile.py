"""Poder estrutural (Kit+Build) vs. poder de meta (Performance+Meta) —
item 3.2. Matemática pura sobre valores já persistidos.
"""

from app.core.power_profile import power_profile

PESOS_COMPLETOS = {"performance": 0.40, "kit": 0.25, "build": 0.25, "meta": 0.10}
PESOS_SEM_KIT = {"performance": 0.40, "build": 0.25, "meta": 0.10}


def test_pesos_estrutural_e_meta_somam_um_com_as_quatro_camadas():
    perfil = power_profile(
        {"performance": 60.0, "kit": 70.0, "build": 50.0, "meta": 40.0}, PESOS_COMPLETOS
    )
    assert perfil["estrutural"]["peso"] + perfil["meta"]["peso"] == 1.0


def test_score_estrutural_e_media_ponderada_de_kit_e_build():
    perfil = power_profile(
        {"performance": 60.0, "kit": 80.0, "build": 60.0, "meta": 40.0}, PESOS_COMPLETOS
    )
    # kit e build têm peso igual (0.25 cada) -> média simples
    assert perfil["estrutural"]["score"] == 70.0


def test_score_meta_e_media_ponderada_de_performance_e_meta():
    perfil = power_profile(
        {"performance": 80.0, "kit": 50.0, "build": 50.0, "meta": 40.0}, PESOS_COMPLETOS
    )
    # performance pesa 0.40, meta pesa 0.10 -> 4x mais performance
    assert perfil["meta"]["score"] == (80.0 * 0.40 + 40.0 * 0.10) / 0.50


def test_kit_ausente_reduz_o_peso_estrutural_sem_fingir_que_continua_50():
    perfil = power_profile({"performance": 60.0, "kit": None, "build": 30.0, "meta": 40.0}, PESOS_SEM_KIT)
    assert perfil["estrutural"]["peso"] == PESOS_SEM_KIT["build"]
    assert perfil["estrutural"]["score"] == 30.0  # só sobrou Build


def test_classificacao_estrutural_quando_kit_build_dominam():
    perfil = power_profile(
        {"performance": 30.0, "kit": 90.0, "build": 90.0, "meta": 30.0}, PESOS_COMPLETOS
    )
    assert perfil["classificacao"] == "estrutural"


def test_classificacao_meta_quando_performance_meta_dominam():
    perfil = power_profile(
        {"performance": 90.0, "kit": 30.0, "build": 30.0, "meta": 90.0}, PESOS_COMPLETOS
    )
    assert perfil["classificacao"] == "meta"


def test_classificacao_equilibrado_dentro_do_limiar():
    perfil = power_profile(
        {"performance": 55.0, "kit": 50.0, "build": 50.0, "meta": 55.0}, PESOS_COMPLETOS
    )
    assert perfil["classificacao"] == "equilibrado"


def test_sem_nenhuma_camada_disponivel_fica_indeterminado():
    perfil = power_profile({"performance": None, "kit": None, "build": None, "meta": None}, {})
    assert perfil["estrutural"]["score"] is None
    assert perfil["meta"]["score"] is None
    assert perfil["classificacao"] == "indeterminado"
