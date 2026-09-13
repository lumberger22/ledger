"""
End-to-end smoke test through the real FastAPI app — mainly a guard against
import-time breakage (a bad router import, a startup-event exception) that
unit tests calling functions directly would never catch.
"""


def test_health_endpoint_is_reachable_without_auth(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
