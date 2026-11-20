import time
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import tenancy  # noqa: F401  (registers the tenant scoping hook)
from .common import CamelJSONResponse
from .routers import admin, attendance, auth, holidays, leave, master, people

app = FastAPI(title="EasyHR API", version="1.0.0", default_response_class=CamelJSONResponse)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://([a-z0-9-]+\.)?localhost(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple in-memory rate limit for login and punch (documentation.md section 9).
_LIMITS = {"/api/auth/login": (10, 60), "/api/attendance/punch": (10, 60)}
_hits: dict[tuple[str, str], deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    """The visitor's IP. In production every request arrives through the Next.js proxy (and the
    host's edge proxy), so the socket peer is the proxy, which would put all users in one bucket.
    The first X-Forwarded-For entry is the original client. A client can forge it, which only lets
    them dodge this soft limit, the same as using more IPs."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "?"


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    rule = _LIMITS.get(request.url.path)
    if rule and request.method == "POST":
        limit, window = rule
        key = (request.url.path, _client_ip(request))
        now = time.monotonic()
        q = _hits[key]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            return JSONResponse({"detail": "Too many attempts. Please wait a minute."}, status_code=429)
        q.append(now)
    return await call_next(request)


for r in (auth, attendance, leave, holidays, people, admin, master):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
