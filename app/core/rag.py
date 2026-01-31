import os
from pathlib import Path
from pymongo import MongoClient
from openai import OpenAI
import certifi
from dotenv import load_dotenv

# Cargar variables (ruta absoluta desde este archivo)
env_path = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(dotenv_path=env_path)

MONGO_URI = os.getenv("MONGODB_URL")
DB_NAME = os.getenv("DB_NAME", "sphere_db")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Conexiones Globales (para no reconectar en cada petición)
# Usamos certifi para evitar tu error de SSL
client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client[DB_NAME]
collection = db["knowledge_base"]
openai_client = OpenAI(api_key=OPENAI_API_KEY)

def retrieve_context(query: str, role: str, limit: int = 3) -> str:
    """
    1. Vectoriza la pregunta.
    2. Busca en MongoDB filtrando por el Rol del agente.
    3. Devuelve un string con el conocimiento encontrado.
    """
    try:
        # 1. Vectorizar pregunta (OpenAI Small)
        query_vector = openai_client.embeddings.create(
            input=[query], 
            model="text-embedding-3-small"
        ).data[0].embedding

        # 2. Pipeline de búsqueda (Con filtro por Rol para que el CTO no lea cosas de Marketing)
        pipeline = [
            {
                "$vectorSearch": {
                    "index": "vector_index",
                    "path": "embedding",
                    "queryVector": query_vector,
                    "numCandidates": 100,
                    "limit": limit,
                    # IMPORTANTE: Aquí filtramos para que cada experto use SU conocimiento
                    "filter": {"agent_target": role} 
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "title": 1,
                    "content_markdown": 1
                }
            }
        ]

        results = list(collection.aggregate(pipeline))
        
        if not results:
            return "No encontré información específica en mi base de conocimientos sobre este tema."

        # 3. Formatear contexto para el Prompt
        context_str = ""
        for doc in results:
            # Cortamos un poco por seguridad de tokens
            snippet = doc.get('content_markdown', '')[:2000] 
            context_str += f"---\nFUENTE: {doc.get('title')}\nCONTENIDO: {snippet}\n\n"
            
        return context_str

    except Exception as e:
        print(f"🔥 Error en RAG: {e}")
        return "Error recuperando contexto de la base de datos."
