"""Instância única do `Limiter` do slowapi, compartilhada entre `main.py`
(registro do middleware) e os routers que usam `@limiter.limit(...)` —
precisa ser a mesma instância nos dois lugares, daqui pra evitar import
circular com `main.py`.

Revisão técnica §2.3: `get_remote_address` (padrão do slowapi) lê
`request.client.host` — atrás do proxy da Vercel, esse é sempre o IP
interno do load balancer, o mesmo pra todo mundo, então o rate limit por
IP hoje efetivamente bucketiza todos os visitantes juntos (ou nenhum,
dependendo de como a Vercel encaminha). `X-Forwarded-For` carrega o IP
real do visitante nesse ambiente — a Vercel é a borda de entrada da
requisição e é ela quem escreve esse header, então um cliente externo não
consegue forjar um IP arbitrário simplesmente mandando o header ele
mesmo (a Vercel sobrescreve, não anexa, o valor recebido de fora). Sem
Redis (decisão já tomada nesta rodada): o contador de limite continua em
memória por processo, o que ainda reseta a cada cold start em ambiente
serverless — limitação conhecida, não resolvida aqui, só documentada."""

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=get_client_ip, default_limits=[get_settings().rate_limit_default])
