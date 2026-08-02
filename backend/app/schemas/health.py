from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    env: str
    checks: dict[str, str] = {}
