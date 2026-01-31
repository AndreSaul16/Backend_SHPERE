"""
Tests para el endpoint de Health.
Verifica que el health check funciona correctamente.
"""
import pytest


class TestHealthEndpoint:
    """Tests para /api/v1/health/"""

    @pytest.mark.asyncio
    async def test_health_check_success(self, async_client):
        """Test: Health check devuelve estado correcto."""
        response = await async_client.get("/api/v1/health/health")
        
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "active"
        assert data["service"] == "SPHERE Orchestrator"
        assert "database" in data
        
        print(f"\n🏥 Health Check:")
        print(f"   Status: {data['status']}")
        print(f"   Database: {data['database']}")
        print(f"   Latency: {data.get('latency_ms')}ms")

    @pytest.mark.asyncio
    async def test_health_check_has_latency(self, async_client):
        """Test: Health check incluye información de latencia."""
        response = await async_client.get("/api/v1/health/health")
        
        data = response.json()
        
        # La latencia debe estar presente si hay conexión
        if "connected" in data.get("database", ""):
            assert data.get("latency_ms") is not None
            assert isinstance(data["latency_ms"], (int, float))
            assert data["latency_ms"] > 0

    @pytest.mark.asyncio
    async def test_health_check_lists_collections(self, async_client):
        """Test: Health check lista las colecciones disponibles."""
        response = await async_client.get("/api/v1/health/health")
        
        data = response.json()
        
        if "connected" in data.get("database", ""):
            assert "collections" in data
            assert isinstance(data["collections"], list)
            print(f"\n📁 Colecciones: {data['collections']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
