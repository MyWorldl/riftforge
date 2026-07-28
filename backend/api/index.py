"""Entry point for Vercel's Python runtime — it detects and serves the ASGI
`app` object exported here directly."""

from app.main import app

__all__ = ["app"]
