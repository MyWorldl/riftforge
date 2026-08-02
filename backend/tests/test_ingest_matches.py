"""`_patch_sequence`: matemática pura, sem rede. Revisão técnica §1.6 —
antes disso, um `version_label` em formato inesperado (já aconteceu em
builds de PBE/evento) levantava um `ValueError` genérico do `int()` sem
dizer qual valor causou o problema."""

import pytest

from app.jobs.ingest_matches import _patch_sequence


def test_patch_sequence_orders_by_major_then_minor():
    assert _patch_sequence("16.9") < _patch_sequence("16.14")
    assert _patch_sequence("15.24") < _patch_sequence("16.1")


def test_patch_sequence_rejects_unexpected_format():
    with pytest.raises(ValueError, match="version_label em formato inesperado"):
        _patch_sequence("16.9.1-pbe")
