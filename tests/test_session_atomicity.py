import pytest
from httpx import AsyncClient
import pytest_asyncio
import uuid

# Mock the database or use a test instance if possible.
# Since we might not have a full test env helper, let's assume we can hit the local running API or mock it via FastAPI TestClient
# But wait, I don't know if the server is running. 
# Better to define a unit test that imports the app and uses TestClient.

from fastapi.testclient import TestClient
from main import app  # Assuming main.py has 'app'
from app.api.v1.sessions import SessionType

client = TestClient(app)

def test_session_atomicity():
    # 1. Create Session A (Direct)
    res_a = client.post("/api/v1/sessions/", json={
        "title": "Session A",
        "base_agent_id": "ceo-1",
        "type": "direct"
    })
    assert res_a.status_code == 200
    session_a = res_a.json()
    id_a = session_a["session_id"]
    
    # 2. Create Session B (Direct) - Same agent, distinct session
    res_b = client.post("/api/v1/sessions/", json={
        "title": "Session B",
        "base_agent_id": "ceo-1",
        "type": "direct"
    })
    assert res_b.status_code == 200
    session_b = res_b.json()
    id_b = session_b["session_id"]
    
    # 3. Customize Session A (Change Color)
    update_res = client.patch(f"/api/v1/sessions/{id_a}", json={
        "visual_config": {"bubble_color": "#FF0000"}
    })
    assert update_res.status_code == 200
    updated_a = update_res.json()
    
    # 4. Verify A is updated
    assert updated_a["visual_config"]["bubble_color"] == "#FF0000"
    
    # 5. Verify B is UNCHANGED
    get_b = client.get(f"/api/v1/sessions/").json()
    # Find session B in list (get_sessions returns all)
    fetched_b = next(s for s in get_b if s["session_id"] == id_b)
    
    # B should NOT have the red color
    assert fetched_b["visual_config"].get("bubble_color") != "#FF0000"
    
    print("✅ Atomicity Verified: Session B not affected by Session A changes.")

def test_group_session_creation():
    # 1. Create Group Session
    res_g = client.post("/api/v1/sessions/", json={
        "title": "Board Meeting",
        "base_agent_id": "group-chat",
        "type": "group",
        "members": ["ceo-1", "cto-1"]
    })
    assert res_g.status_code == 200
    session_g = res_g.json()
    
    assert session_g["type"] == "group"
    assert "ceo-1" in session_g["members"]
    assert "cto-1" in session_g["members"]
    
    # 2. Update Group Theme
    id_g = session_g["session_id"]
    update_res = client.patch(f"/api/v1/sessions/{id_g}", json={
        "visual_config": {"theme": "Magenta"}
    })
    assert update_res.status_code == 200
    updated_g = update_res.json()
    
    assert updated_g["visual_config"]["theme"] == "Magenta"
    print("✅ Group Session Verified.")

if __name__ == "__main__":
    # If running directly, we might need to setup the mock DB or similar if TestClient doesn't do it.
    # Assuming standard pytest run.
    pass
