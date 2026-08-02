"""Instâncias únicas dos adapters externos, compartilhadas entre services —
mesmo padrão de `limiter.py` (evita recriar cliente HTTP/RiotWatcher por
request e evita import circular com `main.py`)."""

from app.adapters.data_dragon import DataDragonAdapter
from app.adapters.riot_api import RiotApiAdapter

data_dragon = DataDragonAdapter()
riot_api = RiotApiAdapter()
