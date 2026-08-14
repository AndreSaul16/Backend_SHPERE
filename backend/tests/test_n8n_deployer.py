"""NWD-001/002/003 — el módulo que decide si los 18 workflows llegan a producción.

Tenía cero líneas ejecutadas por la suite. Aquí se ejercita entero **sin instancia
real**: sólo se sustituye el transporte HTTP (`httpx.MockTransport`), así que el
camino que se prueba es el de producción — `deploy_all_workflows` → `N8NDeployer`
→ `_request` — y no una maqueta.
"""
import ast
import json
from pathlib import Path

import httpx
import pytest

from app.core.config import settings
from app.infrastructure import n8n_deployer as mod

BACKEND = Path(__file__).resolve().parents[1]
APP = BACKEND / "app"
MAIN = BACKEND / "main.py"

WORKFLOW_LOCAL = {
    "name": "SPHERE - Test Workflow",
    "nodes": [{"id": "n1", "name": "Webhook", "type": "n8n-nodes-base.webhook"}],
    "connections": {"Webhook": {"main": [[]]}},
    "settings": {"executionOrder": "v1"},
}


class _N8NFalso:
    """Instancia de n8n simulada: registra peticiones y responde por ruta."""

    def __init__(self, remoto: dict | None = None, status: int = 200):
        self.remoto = remoto
        self.status = status
        self.peticiones: list[str] = []
        self.cuerpos: list[tuple[str, dict]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        clave = f"{request.method} {request.url.path}"
        self.peticiones.append(clave)
        if request.content:
            self.cuerpos.append((clave, json.loads(request.content)))

        if self.status != 200:
            return httpx.Response(self.status, json={"message": "no autorizado"})
        if clave == "GET /api/v1/workflows":
            return httpx.Response(200, json={"data": [self.remoto] if self.remoto else []})
        if clave.startswith("GET /api/v1/workflows/"):
            return httpx.Response(200, json=self.remoto or {})
        if clave == "POST /api/v1/workflows":
            return httpx.Response(200, json={"id": "wf-nuevo", "name": WORKFLOW_LOCAL["name"]})
        if clave.startswith("PUT /api/v1/workflows/"):
            return httpx.Response(200, json={"id": "wf-1"})
        if clave.endswith("/activate") or clave.endswith("/deactivate"):
            return httpx.Response(200, json={})
        return httpx.Response(404, json={"message": f"ruta no simulada: {clave}"})

    def metodos(self, prefijo: str) -> list[str]:
        return [p for p in self.peticiones if p.startswith(prefijo)]


@pytest.fixture
def entorno_deploy(monkeypatch, tmp_path):
    """Directorio de workflows y lock aislados; API key presente.

    El monkeypatch de `_DEPLOY_LOCK_PATH` es obligatorio: el lock NO se borra al
    terminar (por diseño), así que sin aislarlo el segundo test del fichero sería
    un no-op silencioso.
    """
    directorio = tmp_path / "n8n-workflows"
    directorio.mkdir()
    (directorio / "test-workflow.json").write_text(json.dumps(WORKFLOW_LOCAL), encoding="utf-8")

    monkeypatch.setattr(mod, "WORKFLOWS_DIR", directorio)
    monkeypatch.setattr(mod, "_DEPLOY_LOCK_PATH", str(tmp_path / "deploy.lock"))
    monkeypatch.setattr(settings, "N8N_BASE_URL", "http://n8n.test")
    monkeypatch.setattr(settings, "N8N_API_KEY", "api-key-de-test")
    return tmp_path


def _con_transporte(monkeypatch, n8n: _N8NFalso) -> None:
    """Sustituye SÓLO el transporte HTTP del deployer."""

    async def _get_client(self):
        if self._client is None or self._client.is_closed:
            cabeceras = {"X-N8N-API-KEY": self.api_key} if self.api_key else {}
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers=cabeceras,
                transport=httpx.MockTransport(n8n),
            )
        return self._client

    monkeypatch.setattr(mod.N8NDeployer, "_get_client", _get_client)


# ── NWD-001: despliegue idempotente ──────────────────────────────────


async def test_identico_no_se_reescribe(monkeypatch, entorno_deploy):
    remoto = {"id": "wf-1", "active": True, **WORKFLOW_LOCAL}
    n8n = _N8NFalso(remoto=remoto)
    _con_transporte(monkeypatch, n8n)

    await mod.deploy_all_workflows()

    assert n8n.peticiones, "no se emitió ninguna petición: el deploy no llegó a correr"
    assert n8n.metodos("PUT") == [], (
        f"peticiones de actualización emitidas: {n8n.metodos('PUT')}"
    )
    assert n8n.metodos("POST") == [], "un workflow idéntico y activo no se toca"


async def test_diferente_se_actualiza_y_reactiva(monkeypatch, entorno_deploy):
    remoto = {
        "id": "wf-1",
        "active": False,
        "name": WORKFLOW_LOCAL["name"],
        "nodes": [{"id": "n1", "name": "Otro", "type": "n8n-nodes-base.noOp"}],
        "connections": {},
        "settings": {},
    }
    n8n = _N8NFalso(remoto=remoto)
    _con_transporte(monkeypatch, n8n)

    await mod.deploy_all_workflows()

    assert n8n.metodos("PUT") == ["PUT /api/v1/workflows/wf-1"]
    enviados = [cuerpo for clave, cuerpo in n8n.cuerpos if clave.startswith("PUT")]
    assert enviados[0]["nodes"] == WORKFLOW_LOCAL["nodes"], "no se envió el contenido local"
    assert "POST /api/v1/workflows/wf-1/activate" in n8n.peticiones


async def test_inexistente_se_crea_y_activa(monkeypatch, entorno_deploy):
    n8n = _N8NFalso(remoto=None)
    _con_transporte(monkeypatch, n8n)

    await mod.deploy_all_workflows()

    assert "POST /api/v1/workflows" in n8n.peticiones
    creado = [cuerpo for clave, cuerpo in n8n.cuerpos if clave == "POST /api/v1/workflows"][0]
    assert creado["name"] == WORKFLOW_LOCAL["name"]
    assert "id" not in creado, "la API pública rechaza los campos de sólo lectura"
    assert "POST /api/v1/workflows/wf-nuevo/activate" in n8n.peticiones


async def test_401_no_aborta_el_arranque(monkeypatch, entorno_deploy):
    n8n = _N8NFalso(status=401)
    _con_transporte(monkeypatch, n8n)

    # No debe propagar: el lifespan del backend arranca igual.
    await mod.deploy_all_workflows()

    assert "GET /api/v1/workflows" in n8n.peticiones
    assert "POST /api/v1/workflows" in n8n.peticiones, (
        "con la lista vacía por 401, el deployer intenta crear y falla sin excepción"
    )


# ── NWD-002: un solo worker despliega ────────────────────────────────


async def test_segunda_invocacion_es_no_op(monkeypatch, entorno_deploy):
    """Con el lock ya tomado por otro worker, este no emite nada."""
    Path(mod._DEPLOY_LOCK_PATH).write_text("", encoding="utf-8")

    n8n = _N8NFalso(remoto=None)
    _con_transporte(monkeypatch, n8n)

    await mod.deploy_all_workflows()

    assert n8n.metodos("POST") == [], (
        f"peticiones de creación emitidas: {n8n.metodos('POST')}"
    )
    assert n8n.peticiones == [], f"el worker sin lock no debe hablar con n8n: {n8n.peticiones}"


# ── NWD-003: el despliegue no se expone a los agentes ────────────────


def _funciones_publicas_de_modulo(ruta: Path) -> list[str]:
    arbol = ast.parse(ruta.read_text(encoding="utf-8"))
    return [
        nodo.name
        for nodo in arbol.body
        if isinstance(nodo, (ast.FunctionDef, ast.AsyncFunctionDef))
        and not nodo.name.startswith("_")
    ]


def _modulos_del_backend() -> list[Path]:
    excluidos = {"__pycache__"}
    modulos = [p for p in APP.rglob("*.py") if not (set(p.parts) & excluidos)]
    return modulos + [MAIN]


def _llamadores(nombre: str) -> list[Path]:
    encontrados = []
    for modulo in _modulos_del_backend():
        if modulo == Path(mod.__file__):
            continue
        arbol = ast.parse(modulo.read_text(encoding="utf-8"))
        for nodo in ast.walk(arbol):
            if not isinstance(nodo, ast.Call):
                continue
            func = nodo.func
            llamado = getattr(func, "id", None) or getattr(func, "attr", None)
            if llamado == nombre:
                encontrados.append(modulo)
                break
    return encontrados


def test_deployer_sin_entradas_sin_llamadores():
    """Código muerto que insinúa que un workflow puede venir de fuera del repo."""
    publicas = _funciones_publicas_de_modulo(Path(mod.__file__))
    assert publicas, "el análisis AST no encontró ninguna función de módulo"
    huerfanas = [nombre for nombre in publicas if not _llamadores(nombre)]
    assert huerfanas == [], f"funciones sin llamadores: {huerfanas}"


def test_deployer_no_se_expone():
    """Ni una ruta ni un tool pueden instanciar el deployer: con
    NODE_FUNCTION_ALLOW_BUILTIN y el acceso al entorno abiertos —ambos
    obligatorios para el HMAC— un workflow escrito por un LLM leería $env."""
    vigilados = [APP / "presentation", APP / "infrastructure" / "tools"]
    hits = []
    for base in vigilados:
        for modulo in sorted(base.rglob("*.py")):
            for numero, linea in enumerate(
                modulo.read_text(encoding="utf-8").splitlines(), 1
            ):
                limpia = linea.strip()
                if limpia.startswith("#"):
                    continue
                if "N8NDeployer" in limpia:
                    hits.append(f"{modulo.relative_to(APP)}:{numero}")
    assert hits == [], f"N8NDeployer importado en: {hits}"


def test_deploy_all_workflows_solo_lo_llama_el_lifespan():
    llamadores = {p.name for p in _llamadores("deploy_all_workflows")}
    assert llamadores == {"main.py"}, f"llamadores inesperados: {sorted(llamadores)}"
