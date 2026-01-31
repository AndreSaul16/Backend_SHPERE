"""
Tests para el endpoint de Sessions.
Verifica CRUD de sesiones de chat.
"""
import pytest
from datetime import datetime


class TestSessionsEndpoint:
    """Tests para /api/v1/sessions/"""

    @pytest.mark.asyncio
    async def test_create_session(self, async_client):
        """Test: Crear una nueva sesión."""
        response = await async_client.post(
            "/api/v1/sessions/",
            json={"title": "Test Session - Pytest"}
        )
        
        assert response.status_code == 200, f"Error: {response.text}"
        
        data = response.json()
        assert "session_id" in data, "Respuesta no contiene session_id"
        assert data["title"] == "Test Session - Pytest"
        assert "created_at" in data
        
        # Guardar para cleanup
        pytest.session_id_created = data["session_id"]
        print(f"\n✅ Sesión creada: {data['session_id']}")

    @pytest.mark.asyncio
    async def test_create_session_default_title(self, async_client):
        """Test: Crear sesión con título por defecto."""
        response = await async_client.post(
            "/api/v1/sessions/",
            json={}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Nueva Estrategia", "Título por defecto incorrecto"

    @pytest.mark.asyncio
    async def test_list_sessions(self, async_client):
        """Test: Listar todas las sesiones."""
        response = await async_client.get("/api/v1/sessions/")
        
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Respuesta no es una lista"
        print(f"\n📋 Sesiones encontradas: {len(data)}")
        
        # Verificar estructura de cada sesión
        if data:
            session = data[0]
            assert "session_id" in session
            assert "title" in session
            assert "created_at" in session

    @pytest.mark.asyncio
    async def test_get_session_history_empty(self, async_client):
        """Test: Obtener historial de una sesión nueva (vacío)."""
        # Crear sesión primero
        create_response = await async_client.post(
            "/api/v1/sessions/",
            json={"title": "Empty History Test"}
        )
        session_id = create_response.json()["session_id"]
        
        # Obtener historial
        response = await async_client.get(f"/api/v1/sessions/{session_id}/history")
        
        assert response.status_code == 200
        
        data = response.json()
        assert "messages" in data
        assert isinstance(data["messages"], list)
        assert len(data["messages"]) == 0, "Nueva sesión debería tener historial vacío"

    @pytest.mark.asyncio
    async def test_get_session_history_nonexistent(self, async_client):
        """Test: Obtener historial de sesión inexistente (no debería crashear)."""
        fake_id = "nonexistent-session-id-12345"
        
        response = await async_client.get(f"/api/v1/sessions/{fake_id}/history")
        
        # Debería devolver 200 con lista vacía, no error
        assert response.status_code == 200
        data = response.json()
        assert data["messages"] == []

    @pytest.mark.asyncio
    async def test_delete_session(self, async_client):
        """Test: Eliminar una sesión."""
        # Crear sesión para eliminar
        create_response = await async_client.post(
            "/api/v1/sessions/",
            json={"title": "To Be Deleted"}
        )
        session_id = create_response.json()["session_id"]
        
        # Eliminar
        response = await async_client.delete(f"/api/v1/sessions/{session_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "deleted"
        assert data["session_id"] == session_id
        print(f"\n🗑️ Sesión eliminada: {session_id}")

    @pytest.mark.asyncio
    async def test_delete_session_nonexistent(self, async_client):
        """Test: Intentar eliminar sesión inexistente."""
        fake_id = "nonexistent-session-12345"
        
        response = await async_client.delete(f"/api/v1/sessions/{fake_id}")
        
        assert response.status_code == 404, f"Error detallado: {response.text}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
