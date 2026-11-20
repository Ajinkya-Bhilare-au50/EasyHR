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


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    rule = _LIMITS.get(request.url.path)
    if rule and request.method == "POST":
        limit, window = rule
        key = (request.url.path, request.client.host if request.client else "?")
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
