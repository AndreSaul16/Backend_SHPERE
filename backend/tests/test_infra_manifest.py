"""IN-001/002/003 — el manifiesto es el único origen de las invariantes de infra.

Estos tests viven aquí y **no** en `test_ci_infra.py` a propósito: allí el literal
legítimo de otro requisito (la config del frontend, T-004) dispararía un falso
positivo del meta-test de origen único.

Nada de lo que se comprueba aquí está escrito a mano: las rutas prohibidas, las
instrucciones prohibidas y los nombres de variable salen todos de
`scripts/infra-manifest.conf`. Añadir una línea allí basta para que este fichero
y el guard la apliquen (IN-002).
"""
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "scripts" / "infra-manifest.conf"
GUARD = ROOT / "scripts" / "check-monorepo-invariants.sh"

# Directorios que nunca se barren (dependencias, no código del repo).
EXCLUIDOS = {".git", ".venv", "node_modules", "__pycache__", ".pytest_cache", ".ruff_cache"}

KINDS = (
    "root_forbidden",
    "root_forbidden_glob",
    "dockerfile_forbidden",
    "env_required",
    "env_forbidden",
    "compose_required",
    "doc_forbidden",
    "setting",
)


def _load_manifest() -> list[tuple[str, str, str, str]]:
    """Reglas del manifiesto como tuplas (kind, scope, value, note)."""
    reglas: list[tuple[str, str, str, str]] = []
    for numero, linea in enumerate(MANIFEST.read_text(encoding="utf-8").splitlines(), 1):
        limpia = linea.strip()
        if not limpia or limpia.startswith("#"):
            continue
        partes = limpia.split("|", 3)
        assert len(partes) == 4, f"{MANIFEST.name}:{numero} no tiene 4 columnas: {linea!r}"
        reglas.append(tuple(p.strip() for p in partes))  # type: ignore[arg-type]
    return reglas


def _values(kind: str, scope: str | None = None) -> list[str]:
    return [
        value
        for k, s, value, _ in _load_manifest()
        if k == kind and (scope is None or s == scope)
    ]


def _env_name(scope: str, sufijo: str) -> str:
    """Nombre exacto de una variable del manifiesto, localizada por sufijo.

    Se resuelve así —y no escribiendo el nombre— para que el meta-test de origen
    único siga siendo cierto y para que renombrar la variable en el manifiesto
    arrastre a los tests que la usan.
    """
    candidatos = [
        v.split("=", 1)[0]
        for v in _values("env_required", scope)
        if v.split("=", 1)[0].endswith(sufijo)
    ]
    assert len(candidatos) == 1, f"sufijo {sufijo!r} ambiguo o ausente en {scope}: {candidatos}"
    return candidatos[0]


def _ficheros(patrones: list[str]) -> list[Path]:
    """Ficheros del repo que casan con alguno de los patrones, sin dependencias."""
    import fnmatch

    encontrados: list[Path] = []
    for base, dirs, nombres in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUIDOS]
        for nombre in nombres:
            if any(fnmatch.fnmatch(nombre, p) for p in patrones):
                encontrados.append(Path(base) / nombre)
    return sorted(encontrados)


def _run_guard(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", str(GUARD), *args], capture_output=True, text=True, cwd=str(ROOT)
    )


# ── IN-002: el manifiesto existe y se parsea ──────────────────────────


def test_manifiesto_parsea():
    reglas = _load_manifest()
    kinds = {k for k, _, _, _ in reglas}
    faltan = [k for k in KINDS if k not in kinds]
    assert faltan == [], f"kinds sin ninguna regla: {faltan}"
    sin_nota = [f"{k}|{v}" for k, _, v, nota in reglas if not nota]
    assert sin_nota == [], f"reglas sin explicación de su porqué: {sin_nota}"


# ── IN-001: la raíz está limpia y ningún Dockerfile declara VOLUME ────


def test_raiz_limpia():
    prohibidos = [v for v in _values("root_forbidden") if (ROOT / v).exists()]
    prohibidos += [
        p.name for patron in _values("root_forbidden_glob") for p in sorted(ROOT.glob(patron))
    ]
    assert prohibidos == [], f"prohibido en la raíz: {sorted(prohibidos)}"


def test_ningun_dockerfile_declara_volume():
    dockerfiles = _ficheros(_values("root_forbidden_glob"))
    # Anti-test-fantasma: si el barrido no viera ningún fichero, el test pasaría
    # por vacío y no observaría nada.
    assert len(dockerfiles) >= 3, f"el barrido sólo vio {dockerfiles}"

    prohibidas = _values("dockerfile_forbidden")
    assert prohibidas, "el manifiesto no declara ninguna instrucción prohibida"

    hits = []
    for df in dockerfiles:
        for numero, linea in enumerate(df.read_text(encoding="utf-8").splitlines(), 1):
            limpia = linea.strip()
            if not limpia or limpia.startswith("#"):
                continue
            for instruccion in prohibidas:
                if limpia.upper().startswith(f"{instruccion.upper()} "):
                    hits.append(f"{df.relative_to(ROOT)}:{numero} {instruccion}")
    assert hits == [], f"instrucción prohibida en: {hits}"


# ── IN-002: origen único (el meta-test que impide la recaída) ─────────


def test_manifiesto_es_el_unico_origen():
    """Ningún consumidor puede reescribir a mano lo que el manifiesto declara."""
    valores = [v for _, _, v, _ in _load_manifest()]
    consumidores = (GUARD, Path(__file__))
    hits = []
    for consumidor in consumidores:
        for numero, linea in enumerate(
            consumidor.read_text(encoding="utf-8").splitlines(), 1
        ):
            limpia = linea.strip()
            if not limpia or limpia.startswith("#"):
                continue
            for valor in valores:
                if valor in limpia:
                    hits.append(f"{consumidor.name}:{numero} {valor}")
    assert hits == [], f"literales del manifiesto escritos a mano: {hits}"


# ── IN-004: el entorno local arranca con HMAC ────────────────────────


def _compose() -> dict:
    import yaml

    ruta = ROOT / "backend" / "docker-compose.yaml"
    return yaml.safe_load(ruta.read_text(encoding="utf-8"))


def _entorno(servicio: str) -> list[str]:
    """Lista `environment` del servicio en su forma literal `NOMBRE=expresión`."""
    servicios = _compose()["services"]
    assert servicio in servicios, f"servicio ausente en el compose: {sorted(servicios)}"
    declarado = servicios[servicio].get("environment") or []
    if isinstance(declarado, dict):
        return [f"{k}={v}" for k, v in declarado.items()]
    return [str(e) for e in declarado]


def _expresion(servicio: str, nombre: str) -> str | None:
    for entrada in _entorno(servicio):
        clave, _, valor = entrada.partition("=")
        if clave == nombre:
            return valor
    return None


def test_compose_declara_lo_obligatorio():
    """Sin estas tres, los 18 workflows fallan en su primer nodo en local."""
    entorno = _entorno("n8n")
    faltan = []
    for requerida in _values("compose_required", "n8n"):
        nombre, _, valor_exigido = requerida.partition("=")
        if valor_exigido:
            if requerida not in entorno:
                faltan.append(requerida)
        elif not any(e.split("=", 1)[0] == nombre for e in entorno):
            faltan.append(requerida)
    assert faltan == [], f"faltan en el servicio n8n: {faltan}"


def test_secreto_compartido_en_compose():
    """La firma se verifica en los dos extremos: si los valores no resuelven al
    mismo, el nodo Verify Signature rechaza todo lo que el backend envía."""
    nombre = _env_name("backend", "WEBHOOK_SECRET")
    en_backend = _expresion("backend", nombre)
    assert en_backend is not None, f"el servicio backend no declara {nombre}"
    en_n8n = _expresion("n8n", nombre)
    assert en_n8n is not None, f"el servicio n8n no declara {nombre}"
    assert en_n8n == en_backend, (
        f"expresiones distintas: n8n={en_n8n!r} backend={en_backend!r}"
    )


# ── NWI-004: la caducidad de la gracia vive en el manifiesto ─────────


def test_deadline_declarado():
    """El ajuste existe y, si trae valor, es una fecha ISO.

    El test NO afirma ninguna fecha concreta: la fija el dueño cuando se cumpla
    la condición de retirada escrita en el documento canónico.
    """
    from datetime import datetime

    ajustes = [v for v in _values("setting") if v.split("=", 1)[0].endswith("GRACE_DEADLINE")]
    assert len(ajustes) == 1, f"falta el ajuste de caducidad de la gracia: {_values('setting')}"

    _, _, valor = ajustes[0].partition("=")
    if valor and not valor.startswith("<"):
        datetime.fromisoformat(valor)  # no debe lanzar


# ── NWI-004: el workflow firma lo que el backend verifica ────────────


def _codigo_del_nodo(fichero: str, nodo: str) -> str:
    import json

    ruta = ROOT / "backend" / "infrastructure" / "n8n-workflows" / fichero
    workflow = json.loads(ruta.read_text(encoding="utf-8"))
    codigos = [
        n["parameters"]["jsCode"] for n in workflow["nodes"] if n.get("name") == nodo
    ]
    assert len(codigos) == 1, f"nodo {nodo!r} ausente o duplicado en {fichero}"
    return codigos[0]


def test_sign_callback_firma_nonce():
    """`timestamp` y `nonce` van DENTRO del payload: si fueran hermanos suyos, la
    firma no los cubriría y podrían manipularse sin invalidarla."""
    codigo = _codigo_del_nodo("schedule-post.json", "Sign Callback")

    inicio = codigo.index("const payload = {")
    fin = codigo.index("};", inicio)
    bloque = codigo[inicio:fin]

    faltan = [campo for campo in ("timestamp", "nonce") if f"{campo}:" not in bloque]
    assert faltan == [], f"{faltan} no aparecen en el payload de Sign Callback"
    # La firma se calcula después del payload, así que lo cubre entero.
    assert codigo.index("canon(payload)") > fin


# ── NWD-004: del estado de la instancia responde un script ───────────

SALUD = ROOT / "scripts" / "check-n8n-health.sh"
WORKFLOWS = ROOT / "backend" / "infrastructure" / "n8n-workflows"


def _run_salud(*args: str, entorno: dict | None = None) -> subprocess.CompletedProcess:
    """Ejecuta el script sin configuración de n8n heredada del entorno."""
    base = dict(os.environ)
    base.pop(_env_name("backend", "BASE_URL"), None)
    base.pop(_env_name("backend", "API_KEY"), None)
    base.update(entorno or {})
    return subprocess.run(
        ["bash", str(SALUD), *args],
        capture_output=True,
        text=True,
        cwd=str(ROOT),
        env=base,
    )


def _nombres(salida: str) -> set[str]:
    return {linea.strip() for linea in salida.splitlines() if linea.strip()}


def test_health_sin_config_no_concluye():
    """Ausencia de configuración NO es «la instancia no existe»."""
    r = _run_salud()
    assert r.returncode == 4, f"rc={r.returncode}\n{r.stdout}{r.stderr}"

    salida = r.stdout + r.stderr
    afirmaciones = [frase for frase in _values("doc_forbidden") if frase in salida]
    assert afirmaciones == [], f"la salida afirma el estado de la instancia: {afirmaciones}"


def test_conjunto_esperado_coincide():
    """Dos parsers independientes sobre los mismos ficheros: si el del script se
    rompe —o alguien escribe el número a mano—, divergen."""
    import json

    esperado = {
        json.loads(f.read_text(encoding="utf-8"))["name"] for f in WORKFLOWS.glob("*.json")
    }
    assert len(esperado) >= 2, "el directorio de workflows no tiene ficheros que comparar"

    r = _run_salud("--list-expected")
    assert r.returncode == 0, f"rc={r.returncode}\n{r.stdout}{r.stderr}"
    assert _nombres(r.stdout) == esperado


def test_conjunto_sigue_al_directorio(tmp_path):
    """Mata el recuento escrito a mano: con otro directorio, otro conjunto."""
    import json

    (tmp_path / "uno.json").write_text(
        json.dumps({"name": "Inventado Uno", "nodes": []}), encoding="utf-8"
    )
    (tmp_path / "dos.json").write_text(
        json.dumps({"name": "Inventado Dos", "nodes": []}), encoding="utf-8"
    )

    r = _run_salud("--list-expected", entorno={"N8N_WORKFLOWS_DIR": str(tmp_path)})

    assert r.returncode == 0, f"rc={r.returncode}\n{r.stdout}{r.stderr}"
    assert _nombres(r.stdout) == {"Inventado Uno", "Inventado Dos"}


def test_health_no_filtra_la_api_key():
    """Ni entera ni por fragmentos: un log con media clave sigue siendo una fuga."""
    from uuid import uuid4

    centinela = f"centinela{uuid4().hex}{uuid4().hex}"
    r = _run_salud(
        entorno={
            _env_name("backend", "BASE_URL"): "http://127.0.0.1:1",
            _env_name("backend", "API_KEY"): centinela,
        }
    )

    assert r.returncode == 3, f"rc={r.returncode}\n{r.stdout}{r.stderr}"

    salida = r.stdout + r.stderr
    fragmentos = [
        centinela[i : i + 8] for i in range(len(centinela) - 7) if centinela[i : i + 8] in salida
    ]
    assert fragmentos == [], f"el centinela aparece en la salida del script: {fragmentos}"
    assert "set -x" not in SALUD.read_text(encoding="utf-8")


# ── IN-005: documentos decidibles, no afirmativos ────────────────────

DOCS = ROOT / "docs"
CANONICO = DOCS / "CONEXIONES_Y_N8N_SETUP.md"
CITAN_EL_SCRIPT = ("DEPLOY_CHECKLIST.md", "DEPLOYMENT_RUNBOOK.md")


def _documentos() -> list[Path]:
    """Alcance explícito: sólo `docs/*.md`.

    Fuera quedan `openspec/**` (las specs nombran a propósito la variable que no
    existe, para prohibirla) y la raíz del repo, que lleva ficheros sin seguir.
    """
    return sorted(DOCS.glob("*.md"))


def _nombres_en_bloque(texto: str, marca: str) -> set[str]:
    """Nombres entre `backticks` dentro de un bloque delimitado del documento."""
    import re

    abre, cierra = f"<!-- {marca} -->", f"<!-- /{marca} -->"
    assert abre in texto and cierra in texto, f"falta el bloque delimitado {marca!r}"
    bloque = texto[texto.index(abre) : texto.index(cierra)]
    return set(re.findall(r"`([A-Z][A-Z0-9_]+)`", bloque))


def test_documentos_decidibles():
    """Ningún documento afirma el estado de la instancia ni nombra variables
    inexistentes; y los dos documentos oficiales remiten al script."""
    prohibidas = _values("doc_forbidden") + _values("env_forbidden")
    assert prohibidas, "el manifiesto no declara ninguna frase prohibida"

    documentos = _documentos()
    assert len(documentos) >= 3, f"el barrido sólo vio {documentos}"

    hits = []
    for doc in documentos:
        for numero, linea in enumerate(doc.read_text(encoding="utf-8").splitlines(), 1):
            for frase in prohibidas:
                if frase in linea:
                    hits.append(f"{doc.name}:{numero} {frase}")
    assert hits == [], f"frases prohibidas: {hits}"

    sin_cita = [
        nombre
        for nombre in CITAN_EL_SCRIPT
        if SALUD.name not in (DOCS / nombre).read_text(encoding="utf-8")
    ]
    assert sin_cita == [], f"documentos que no remiten al script: {sin_cita}"


def test_lista_de_variables_en_un_solo_sitio():
    """La lista que el dueño debe configurar vive en el manifiesto; el documento
    canónico la explica; el resto enlaza."""
    nombres = {v.split("=", 1)[0] for v in _values("env_required", "n8n")}

    en_el_doc = _nombres_en_bloque(CANONICO.read_text(encoding="utf-8"), "manifiesto:n8n")
    assert en_el_doc == nombres, (
        f"el documento canónico no refleja el manifiesto: "
        f"sobran {sorted(en_el_doc - nombres)}, faltan {sorted(nombres - en_el_doc)}"
    )

    infractores = []
    for doc in _documentos():
        if doc == CANONICO:
            continue
        texto = doc.read_text(encoding="utf-8")
        presentes = sorted(n for n in nombres if n in texto)
        if len(presentes) >= 2:
            infractores.append(f"{doc.name} {presentes}")
    assert infractores == [], f"documentos que declaran la lista por su cuenta: {infractores}"


# ── IN-003: el resultado del guard es asertable ───────────────────────


def test_guard_reporta_raiz_por_separado():
    """`root=PASS` es afirmable aunque el scoping siga en rojo por ci.yml."""
    r = _run_guard()
    assert "INVARIANTS root=PASS" in r.stdout, r.stdout
    # El fallo de scoping (workflow sin filtro de rutas) queda fuera de alcance
    # y NO se oculta: el resultado global lo sigue reflejando.
    assert r.returncode == 2, f"rc={r.returncode}\n{r.stdout}"


def test_guard_only_root():
    r = _run_guard("--only", "root")
    assert r.returncode == 0, f"rc={r.returncode}\n{r.stdout}"
    assert "INVARIANTS root=PASS" in r.stdout


def test_guard_only_scoping():
    r = _run_guard("--only", "scoping")
    assert r.returncode == 2, f"rc={r.returncode}\n{r.stdout}"
    assert "scoping=FAIL" in r.stdout


def test_guard_argumento_desconocido():
    r = _run_guard("--only", "pepe")
    assert r.returncode == 1, f"rc={r.returncode}\n{r.stdout}{r.stderr}"
