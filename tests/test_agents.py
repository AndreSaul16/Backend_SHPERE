"""
Tests para el endpoint de Agents.
Verifica CRUD de agentes personalizados.
"""
import pytest
from datetime import datetime


class TestAgentsEndpoint:
    """Tests para /api/v1/agents/"""

    @pytest.mark.asyncio
    async def test_create_agent(self, async_client):
        """Test: Crear un nuevo agente evolucionado."""
        agent_data = {
            "identity": {
                "name": "Oberon Pytest",
                "role": "tester",
                "color": "purple"
            },
            "brain_config": {
                "system_prompt": "Eres un agente de prueba evolucionado.",
                "model": "deepseek-r1"
            },
            "default_tools": ["tester_tool"]
        }
        
        response = await async_client.post("/api/v1/agents/", json=agent_data)
        
        assert response.status_code == 200, f"Error: {response.text}"
        
        data = response.json()
        assert "agent_id" in data
        assert data["identity"]["name"] == "Oberon Pytest"
        assert data["brain_config"]["model"] == "deepseek-r1"
        assert "tester_tool" in data["default_tools"]
        
        # Guardar ID para otros tests
        pytest.test_agent_id = data["agent_id"]
        print(f"\n✅ Agente evolucionado creado: {data['agent_id']}")

    @pytest.mark.asyncio
    async def test_create_agent_defaults(self, async_client):
        """Test: Crear agente con valores por defecto."""
        agent_data = {
            "identity": {"name": "Agente Minimal"},
            "brain_config": {"system_prompt": "Prompt básico"}
        }
        
        response = await async_client.post("/api/v1/agents/", json=agent_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verificar defaults
        assert data["identity"]["role"] == "specialist"
        assert data["brain_config"]["model"] == "deepseek-r1"
        assert data["is_public"] is False

    @pytest.mark.asyncio
    async def test_list_agents(self, async_client):
        """Test: Listar todos los agentes."""
        response = await async_client.get("/api/v1/agents/")
        
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"\n📋 Agentes encontrados: {len(data)}")
        
        # Verificar estructura
        if data:
            agent = data[0]
            assert "agent_id" in agent
            assert "name" in agent
            assert "description" in agent

    @pytest.mark.asyncio
    async def test_get_agent_detail(self, async_client):
        """Test: Obtener detalles de un agente (incluyendo prompt)."""
        # Crear agente primero
        agent_data = {
            "name": "Detail Test Agent",
            "description": "Para test de detalle",
            "system_prompt": "Este es el prompt secreto"
        }
        create_response = await async_client.post("/api/v1/agents/", json=agent_data)
        agent_id = create_response.json()["agent_id"]
        
        # Obtener detalle
        response = await async_client.get(f"/api/v1/agents/{agent_id}")
        
        assert response.status_code == 200
        
        data = response.json()
        assert data["agent_id"] == agent_id
        assert "system_prompt" in data, "Detalle no incluye system_prompt"
        assert data["system_prompt"] == "Este es el prompt secreto"

    @pytest.mark.asyncio
    async def test_get_agent_nonexistent(self, async_client):
        """Test: Obtener agente inexistente."""
        fake_id = "nonexistent-agent-12345"
        
        response = await async_client.get(f"/api/v1/agents/{fake_id}")
        
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_agent(self, async_client):
        """Test: Eliminar un agente."""
        # Crear agente para eliminar
        agent_data = {
            "name": "To Be Deleted",
            "description": "Este agente será eliminado",
            "system_prompt": "..."
        }
        create_response = await async_client.post("/api/v1/agents/", json=agent_data)
        agent_id = create_response.json()["agent_id"]
        
        # Eliminar
        response = await async_client.delete(f"/api/v1/agents/{agent_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "deleted"
        assert data["agent_id"] == agent_id
        print(f"\n🗑️ Agente eliminado: {agent_id}")
        
        # Verificar que ya no existe
        get_response = await async_client.get(f"/api/v1/agents/{agent_id}")
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_agent_nonexistent(self, async_client):
        """Test: Eliminar agente inexistente."""
        fake_id = "nonexistent-agent-12345"
        
        response = await async_client.delete(f"/api/v1/agents/{fake_id}")
        
        assert response.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
