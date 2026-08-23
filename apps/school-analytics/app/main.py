"""school-analytics — a Python (FastAPI) service that AGGREGATES data from the
Node.js school-api instead of owning a database.

Why it exists in this learning repo:
  * shows a second language/runtime living in the same cluster
  * shows service-to-service communication: this service calls school-api
    through its Kubernetes Service DNS name (http://school-api)
  * all /analytics/* routes are prefixed so the ALB Ingress can route by path:
      /analytics/... -> this service,  everything else -> school-api
"""
import os
from collections import Counter

import httpx
from fastapi import APIRouter, FastAPI, HTTPException

# Inside the cluster this is http://school-api (the Service name, port 80).
# In docker-compose it is http://api:3000. Locally: http://localhost:3000.
SCHOOL_API_URL = os.environ.get("SCHOOL_API_URL", "http://localhost:3000")

app = FastAPI(title="school-analytics", version="1.0.0")
router = APIRouter(prefix="/analytics")


async def fetch_json(path: str):
    """GET a path from the school-api and return parsed JSON."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{SCHOOL_API_URL}{path}")
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"school-api unreachable: {exc}") from exc


# ---------------------------------------------------------------------------
# Health endpoints (root level — used by the Kubernetes probes)
# ---------------------------------------------------------------------------
@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.get("/readyz")
async def readyz():
    # Ready only if the upstream school-api answers — same idea as the
    # Node service's readiness check against its database.
    await fetch_json("/healthz")
    return {"status": "ready", "upstream": SCHOOL_API_URL}


# ---------------------------------------------------------------------------
# Analytics routes (prefixed with /analytics for ALB path routing)
# ---------------------------------------------------------------------------
@router.get("/")
async def index():
    return {
        "service": "school-analytics",
        "language": "python",
        "upstream": SCHOOL_API_URL,
        "endpoints": ["/analytics/stats/students", "/analytics/stats/teachers", "/analytics/summary"],
    }


@router.get("/stats/students")
async def student_stats():
    students = await fetch_json("/students")
    by_grade = Counter(s["grade"] for s in students)
    return {"total": len(students), "by_grade": dict(sorted(by_grade.items()))}


@router.get("/stats/teachers")
async def teacher_stats():
    teachers = await fetch_json("/teachers")
    by_subject = Counter(t["subject"] for t in teachers)
    return {"total": len(teachers), "by_subject": dict(sorted(by_subject.items()))}


@router.get("/summary")
async def summary():
    students = await fetch_json("/students")
    teachers = await fetch_json("/teachers")
    return {
        "students": len(students),
        "teachers": len(teachers),
        "students_per_teacher": round(len(students) / len(teachers), 1) if teachers else None,
    }


app.include_router(router)
