"""Tests mock the school-api upstream so they run without any other service."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402

client = TestClient(main.app)

FAKE = {
    "/students": [
        {"id": 1, "name": "A", "grade": "5A"},
        {"id": 2, "name": "B", "grade": "5A"},
        {"id": 3, "name": "C", "grade": "6B"},
    ],
    "/teachers": [{"id": 1, "name": "T", "subject": "Maths"}],
    "/healthz": {"status": "ok"},
}


async def fake_fetch(path):
    return FAKE[path]


def setup_module():
    main.fetch_json = fake_fetch


def test_healthz():
    assert client.get("/healthz").json() == {"status": "ok"}


def test_student_stats():
    body = client.get("/analytics/stats/students").json()
    assert body["total"] == 3
    assert body["by_grade"] == {"5A": 2, "6B": 1}


def test_summary():
    body = client.get("/analytics/summary").json()
    assert body["students"] == 3
    assert body["students_per_teacher"] == 3.0
