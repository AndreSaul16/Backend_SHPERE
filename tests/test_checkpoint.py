"""
Tests para el Checkpointer de LangGraph.
Verifica que la persistencia de memoria funciona correctamente.
"""
import pytest
from datetime import datetime


class TestCheckpointer:
    """Tests para la persistencia de LangGraph con MongoDB."""

    def test_checkpointer_initialized(self):
        """Test: Verificar que el checkpointer está inicializado."""
        from app.core.orchestrator import checkpointer
        
        assert checkpointer is not None, "Checkpointer no está inicializado"
        print(f"\n✅ Checkpointer tipo: {type(checkpointer).__name__}")

    def test_sync_client_available(self, db_instance):
        """Test: Cliente síncrono disponible para checkpointer."""
        sync_client = db_instance.get_sync_client()
        
        assert sync_client is not None
        
        # Verificar que puede hacer operaciones
        ping_result = sync_client.admin.command('ping')
        assert ping_result.get('ok') == 1.0

    def test_checkpoint_collection_writable(self, db_instance):
        """Test: La colección de checkpoints es escribible."""
        from langgraph.checkpoint.mongodb import MongoDBSaver
        
        sync_client = db_instance.get_sync_client()
        checkpointer = MongoDBSaver(sync_client)
        
        # Verificar que el saver tiene acceso al cliente
        assert checkpointer is not None

    def test_put_and_get_checkpoint(self, db_instance):
        """Test: Guardar y recuperar un checkpoint."""
        from langgraph.checkpoint.mongodb import MongoDBSaver
        from langgraph.checkpoint.base import Checkpoint, CheckpointMetadata
        import uuid
        
        sync_client = db_instance.get_sync_client()
        saver = MongoDBSaver(sync_client)
        
        # Crear configuración de prueba
        test_thread_id = f"test-thread-{uuid.uuid4()}"
        config = {"configurable": {"thread_id": test_thread_id, "checkpoint_ns": ""}}
        
        # Crear checkpoint de prueba
        checkpoint = Checkpoint(
            v=1,
            id=str(uuid.uuid4()),
            ts=datetime.now().isoformat(),
            channel_values={"messages": ["test message"]},
            channel_versions={},
            versions_seen={},
            pending_sends=[],
        )
        metadata = CheckpointMetadata()
        
        try:
            # Guardar
            result = saver.put(config, checkpoint, metadata, {})
            print(f"\n💾 Checkpoint guardado: {result}")
            
            # Recuperar
            tuple_result = saver.get_tuple(config)
            assert tuple_result is not None, "No se pudo recuperar el checkpoint"
            
            recovered_checkpoint = tuple_result.checkpoint
            assert recovered_checkpoint["channel_values"]["messages"] == ["test message"]
            print(f"✅ Checkpoint recuperado correctamente")
            
        except Exception as e:
            pytest.fail(f"Error en put/get checkpoint: {e}")

    def test_checkpoint_persistence_across_sessions(self, db_instance):
        """Test: Los checkpoints persisten entre 'sesiones' del grafo."""
        from langgraph.checkpoint.mongodb import MongoDBSaver
        from langgraph.checkpoint.base import Checkpoint, CheckpointMetadata
        import uuid
        
        sync_client = db_instance.get_sync_client()
        
        # Simular dos instancias del saver (como si reiniciáramos el servidor)
        saver1 = MongoDBSaver(sync_client)
        
        test_thread_id = f"persistence-test-{uuid.uuid4()}"
        config = {"configurable": {"thread_id": test_thread_id, "checkpoint_ns": ""}}
        
        # Guardar con saver1
        checkpoint = Checkpoint(
            v=1,
            id=str(uuid.uuid4()),
            ts=datetime.now().isoformat(),
            channel_values={"test_data": "persistence_works"},
            channel_versions={},
            versions_seen={},
            pending_sends=[],
        )
        
        saver1.put(config, checkpoint, CheckpointMetadata(), {})
        
        # Crear nueva instancia del saver (simula reinicio)
        saver2 = MongoDBSaver(sync_client)
        
        # Recuperar con saver2
        tuple_result = saver2.get_tuple(config)
        
        assert tuple_result is not None, "Checkpoint no persistió entre sesiones"
        assert tuple_result.checkpoint["channel_values"]["test_data"] == "persistence_works"
        print(f"\n✅ Persistencia verificada entre 'sesiones'")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
