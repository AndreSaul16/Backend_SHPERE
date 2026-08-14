"""
Despliega workflows de n8n automáticamente via API.
SPHERE es el single source of truth - n8n es infraestructura.

En startup:
1. Conecta a n8n via API
2. Lista workflows existentes
3. Crea los que faltan
4. Activa los que están inactivos

El usuario NUNCA toca n8n. Solo configura API keys en SPHERE.
"""

import json
import os
import tempfile
from pathlib import Path
from typing import Optional

import httpx

from app.core.config import settings
from app.core.logger import api_logger as logger

# Campos que la API pública de n8n acepta al crear/actualizar un workflow.
# El resto (id, active, tags, versionId, pinData, meta, triggerCount,
# createdAt, updatedAt, shared...) son read-only y devuelven 400 si se envían.
_WORKFLOW_WRITABLE_FIELDS = ("name", "nodes", "connections", "settings", "staticData")

# Lock entre procesos: uvicorn corre con varios workers y cada uno ejecuta el
# lifespan; sin esto, los N workers crearían N copias de cada workflow (los
# nombres NO son únicos en n8n). El primer worker que crea el fichero gana y
# despliega; el resto hace no-op. El lock vive en el FS efímero del contenedor,
# así que cada redeploy (contenedor nuevo) empieza limpio.
_DEPLOY_LOCK_PATH = os.path.join(tempfile.gettempdir(), "sphere_n8n_deploy.lock")

# Directorio donde están los workflow JSON.
# Este módulo vive en backend/app/infrastructure/, así que parents[2] == backend/.
# Los JSON están en backend/infrastructure/n8n-workflows/ (NO en backend/app/...).
# En el contenedor (WORKDIR /app, rootDirectory=backend) esto resuelve a
# /app/infrastructure/n8n-workflows. Antes apuntaba a parents[2]/n8n-workflows
# (= backend/n8n-workflows), que no existe → 0 workflows importados.
WORKFLOWS_DIR = Path(__file__).parents[2] / "infrastructure" / "n8n-workflows"


def _workflow_differs(remote: dict, local: dict) -> bool:
    """Compara el contenido relevante (nodes/connections/settings) de un workflow
    remoto (n8n) contra el local (JSON del repo). Devuelve True si difiere.

    Comparamos de forma normalizada (JSON ordenado por claves) y solo los campos
    que controlamos; ignoramos metadatos read-only que n8n añade (id, position de
    UI no se ignora porque va en nodes, pero un cambio de posición es inofensivo y
    fuerza un update idempotente — aceptable)."""
    for field in ("nodes", "connections", "settings"):
        r = json.dumps(remote.get(field) or ([] if field == "nodes" else {}), sort_keys=True)
        loc = json.dumps(local.get(field) or ([] if field == "nodes" else {}), sort_keys=True)
        if r != loc:
            return True
    return False


class N8NDeployer:
    """Despliega y sincroniza workflows de n8n via API REST."""

    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers = {}
            if self.api_key:
                headers["X-N8N-API-KEY"] = self.api_key
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers=headers,
                timeout=30.0,
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        """Hace una request a la API de n8n con manejo de errores."""
        client = await self._get_client()
        try:
            resp = await client.request(method, path, **kwargs)
            resp.raise_for_status()
            return resp.json() if resp.content else {}
        except httpx.HTTPStatusError as e:
            logger.error(
                f"n8n API error: {e.response.status_code} - {e.response.text[:200]}"
            )
            raise
        except httpx.ConnectError:
            logger.warning(f"No se pudo conectar a n8n en {self.base_url}")
            raise
        except Exception as e:
            logger.error(f"Error inesperado en n8n API: {e}")
            raise

    async def list_workflows(self) -> list[dict]:
        """Lista todos los workflows en n8n."""
        try:
            result = await self._request("GET", "/api/v1/workflows")
            return result.get("data", [])
        except Exception:
            return []

    async def get_workflow(self, workflow_id: str) -> Optional[dict]:
        """Obtiene un workflow por ID."""
        try:
            return await self._request("GET", f"/api/v1/workflows/{workflow_id}")
        except Exception:
            return None

    async def create_workflow(self, workflow_data: dict) -> Optional[dict]:
        """Crea un nuevo workflow en n8n."""
        try:
            # Solo los campos escribibles: la API rechaza tags/versionId/active/etc.
            clean_data = {
                k: workflow_data[k]
                for k in _WORKFLOW_WRITABLE_FIELDS
                if k in workflow_data
            }
            result = await self._request("POST", "/api/v1/workflows", json=clean_data)
            logger.info(f"✅ Workflow creado: {workflow_data.get('name', 'unknown')}")
            return result
        except Exception as e:
            logger.error(f"❌ Error creando workflow: {e}")
            return None

    async def update_workflow(
        self, workflow_id: str, workflow_data: dict
    ) -> Optional[dict]:
        """Actualiza un workflow existente."""
        try:
            clean_data = {
                k: workflow_data[k]
                for k in _WORKFLOW_WRITABLE_FIELDS
                if k in workflow_data
            }
            result = await self._request(
                "PUT", f"/api/v1/workflows/{workflow_id}", json=clean_data
            )
            logger.info(
                f"✅ Workflow actualizado: {workflow_data.get('name', 'unknown')}"
            )
            return result
        except Exception as e:
            logger.error(f"❌ Error actualizando workflow: {e}")
            return None

    async def activate_workflow(self, workflow_id: str) -> bool:
        """Activa un workflow."""
        # La API pública de n8n usa un endpoint dedicado; `active` es read-only
        # en POST/PUT, así que no se puede activar por PATCH del campo.
        try:
            await self._request(
                "POST", f"/api/v1/workflows/{workflow_id}/activate"
            )
            logger.info(f"✅ Workflow activado: {workflow_id}")
            return True
        except Exception as e:
            logger.error(f"❌ Error activando workflow {workflow_id}: {e}")
            return False

    async def deactivate_workflow(self, workflow_id: str) -> bool:
        """Desactiva un workflow."""
        try:
            await self._request(
                "POST", f"/api/v1/workflows/{workflow_id}/deactivate"
            )
            return True
        except Exception:
            return False


async def deploy_all_workflows():
    """
    Punto de entrada principal: despliega todos los workflows de SPHERE en n8n.
    Se llama en el startup de FastAPI.

    Flujo:
    1. Conecta a n8n
    2. Lista workflows existentes
    3. Para cada workflow en n8n-workflows/:
       - Si no existe → crear
       - Si existe pero difiere → actualizar
       - Si existe pero está inactivo → activar
    4. Cerrar conexión
    """
    if not settings.N8N_BASE_URL:
        logger.warning(
            "⚠️ N8N_BASE_URL no configurado. Workflows de n8n no se deployarán."
        )
        return

    if not getattr(settings, "N8N_API_KEY", ""):
        # Sin API key, list/create devuelven 401 silencioso → 0 workflows y todas
        # las tools fallando en runtime. Que el operador lo vea en el arranque.
        logger.critical(
            "🚨 N8N_BASE_URL está configurado pero falta N8N_API_KEY: el deploy de "
            "workflows fallará (401) y las tools de n8n no funcionarán."
        )

    # Buscar archivos de workflow
    if not WORKFLOWS_DIR.exists():
        logger.warning(f"⚠️ Directorio de workflows no existe: {WORKFLOWS_DIR}")
        return

    workflow_files = list(WORKFLOWS_DIR.glob("*.json"))
    if not workflow_files:
        logger.warning("⚠️ No se encontraron archivos de workflow en n8n-workflows/")
        return

    # Lock entre workers: solo uno despliega (ver _DEPLOY_LOCK_PATH). El resto
    # hace no-op para no crear copias duplicadas de cada workflow.
    try:
        fd = os.open(_DEPLOY_LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(fd)
    except FileExistsError:
        logger.info(
            "⏭️ Otro worker ya está desplegando los workflows de n8n; este los omite."
        )
        return

    logger.info(f"📦 Deployando {len(workflow_files)} workflows a n8n...")

    deployer = N8NDeployer(
        base_url=settings.N8N_BASE_URL,
        api_key=getattr(settings, "N8N_API_KEY", None),
    )

    try:
        # 1. Listar workflows existentes
        existing_workflows = await deployer.list_workflows()
        existing_by_name = {w["name"]: w for w in existing_workflows}

        created = 0
        updated = 0
        activated = 0
        skipped = 0

        # 2. Procesar cada workflow
        for workflow_file in workflow_files:
            try:
                workflow_data = json.loads(workflow_file.read_text())
                name = workflow_data.get("name", "")

                if not name:
                    logger.warning(f"⚠️ Workflow sin nombre: {workflow_file.name}")
                    continue

                existing = existing_by_name.get(name)

                if existing:
                    # El workflow ya existe
                    workflow_id = existing["id"]

                    # Sincronizar contenido si difiere (nodes/connections/settings).
                    # Antes era un TODO → los cambios en los JSON nunca llegaban a n8n
                    # (había que borrar el workflow a mano). Ahora se actualiza solo.
                    full = await deployer.get_workflow(workflow_id) or existing
                    if _workflow_differs(full, workflow_data):
                        await deployer.update_workflow(workflow_id, workflow_data)
                        updated += 1
                        logger.info(f"🔄 Workflow actualizado (contenido difiere): {name}")
                    else:
                        skipped += 1
                        logger.debug(f"⏭️ Workflow ya existe e idéntico: {name}")

                    # Verificar si está activo (tras update puede requerir re-activación)
                    refreshed = await deployer.get_workflow(workflow_id) or existing
                    if not refreshed.get("active", False):
                        await deployer.activate_workflow(workflow_id)
                        activated += 1

                else:
                    # Crear workflow nuevo
                    result = await deployer.create_workflow(workflow_data)
                    if result:
                        created += 1
                        # Activar el workflow recién creado
                        new_id = result.get("id")
                        if new_id:
                            await deployer.activate_workflow(new_id)
                            activated += 1

            except json.JSONDecodeError as e:
                logger.error(f"❌ JSON inválido en {workflow_file.name}: {e}")
            except Exception as e:
                logger.error(f"❌ Error procesando {workflow_file.name}: {e}")

        logger.info(
            f"✅ Deploy de n8n completado: "
            f"{created} creados, {updated} actualizados, "
            f"{activated} activados, {skipped} existentes"
        )

    except Exception as e:
        logger.warning(f"⚠️ No se pudo conectar a n8n. Workflows no deployados: {e}")
        logger.info(
            "💡 Los workflows se deployarán en el próximo reinicio cuando n8n esté disponible."
        )

    finally:
        await deployer.close()

