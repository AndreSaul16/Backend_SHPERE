"""Tests for CI/CD infrastructure configuration.

Validates GitHub Actions workflow, Dockerfiles, Railway configs,
dependency pinning, and build hygiene.
"""

import json
import os
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]  # SPHERE repo root


def read_ci_yml() -> dict:
    path = ROOT / ".github" / "workflows" / "ci.yml"
    if not path.exists():
        raise FileNotFoundError(f"ci.yml not found at {path}")
    with open(path) as f:
        return yaml.safe_load(f)


# ── T-001: CI Pipeline ────────────────────────────────────────────────


def read_trigger_branches() -> tuple[list[str], list[str]]:
    """Devuelve (push.branches, pull_request.branches) de ci.yml."""
    ci = read_ci_yml()
    # PyYAML 1.1 parses 'on' as boolean True; GitHub Actions docs use literal 'on'
    on = ci.get("on", ci.get(True))
    assert on is not None, "Missing 'on' trigger block"
    assert on.get("push") is not None, "Missing push trigger"
    assert on.get("pull_request") is not None, "Missing pull_request trigger"

    def branches_of(cfg) -> list[str]:
        if isinstance(cfg, str):
            return [cfg]
        return list(cfg.get("branches", []))

    return branches_of(on["push"]), branches_of(on["pull_request"])


def resolve_default_branch() -> str | None:
    """Rama por defecto REAL del repo, sin codificar ningún nombre.

    En CI la da el propio workflow (SPHERE_DEFAULT_BRANCH). En local se deduce
    de origin/HEAD. `git rev-parse --abbrev-ref HEAD` no vale: en un PR el
    checkout está detached, y GITHUB_BASE_REF es la rama destino del PR, que no
    tiene por qué ser la por defecto.

    El fallback de git es *best effort* y por eso el contrato admite devolver
    algo falsy: en un checkout estilo `actions/checkout` (init + fetch --depth=1)
    `refs/remotes/origin/HEAD` no existe y git sale con rc=128 → None → el test
    hace skip. En un `clone --single-branch` origin/HEAD apunta a la rama
    clonada, no a la por defecto; eso NO es distinguible sin red (este mismo
    repo es shallow y single-branch y sí acierta), así que la garantía real la
    da SPHERE_DEFAULT_BRANCH, que el workflow exporta siempre.
    """
    from_env = os.environ.get("SPHERE_DEFAULT_BRANCH", "").strip()
    if from_env:
        return from_env

    import subprocess

    try:
        out = subprocess.run(
            ["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
            cwd=ROOT, capture_output=True, text=True, timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0:
        return None
    ref = out.stdout.strip()  # p. ej. "origin/master"
    return ref.split("/", 1)[1] if "/" in ref else ref or None


def test_ci_yml_merge_gate_targets_default_branch():
    """CI-001: la puerta de merge apunta a la rama por defecto REAL del repo.

    Valida la intención, no la forma: el workflow debe disparar en pull_request
    contra la rama por defecto, y NO en push sobre ella (eso provocó los deploys
    SKIPPED de 1867ff4). Añadir más patrones de ramas de trabajo no rompe nada.
    """
    from fnmatch import fnmatch

    default_branch = resolve_default_branch()
    if not default_branch:
        pytest.skip(
            "No se pudo resolver la rama por defecto: ni SPHERE_DEFAULT_BRANCH "
            "ni origin/HEAD disponibles"
        )

    push_branches, pr_branches = read_trigger_branches()

    assert default_branch in pr_branches, (
        f"La rama por defecto ({default_branch!r}) debe estar en "
        f"pull_request.branches para que exista puerta de merge; "
        f"hay {pr_branches!r}"
    )

    covering = [p for p in push_branches if fnmatch(default_branch, p)]
    assert not covering, (
        f"push.branches cubre la rama por defecto ({default_branch!r}) vía "
        f"{covering!r}. Eso reintroduce los deploys SKIPPED de 1867ff4."
    )


def test_ci_yml_push_never_covers_merge_gate_branches():
    """CI-001: invariante puro de YAML, sin git ni entorno — siempre corre.

    Ningún patrón de push puede cubrir una rama que ya tiene puerta de merge por
    pull_request: sería disparar dos veces y, sobre la rama por defecto,
    reproducir el incidente de deploys SKIPPED.
    """
    from fnmatch import fnmatch

    push_branches, pr_branches = read_trigger_branches()

    assert push_branches, (
        "push.branches vacío: se pierde la verificación continua durante el "
        "desarrollo"
    )

    overlaps = [
        (pattern, branch)
        for pattern in push_branches
        for branch in pr_branches
        if fnmatch(branch, pattern)
    ]
    assert not overlaps, (
        f"Patrones de push que cubren ramas de la puerta de merge: {overlaps!r}"
    )


def test_ci_yml_has_backend_job_with_services():
    """CI-001: test-backend job exists with mongo + redis services."""
    ci = read_ci_yml()
    jobs = ci["jobs"]
    backend = jobs["test-backend"]

    # Matrix
    matrix = backend["strategy"]["matrix"]
    assert "3.11" in matrix["python-version"]

    # Service containers
    services = backend.get("services", {})
    assert "mongodb" in services, "Missing MongoDB service"
    assert "redis" in services, "Missing Redis service"

    mongo_svc = services["mongodb"]
    assert "mongo" in mongo_svc.get("image", ""), "MongoDB image not mongo"
    assert "27017" in str(mongo_svc.get("ports", [])), "Missing port 27017"

    redis_svc = services["redis"]
    assert "redis" in redis_svc.get("image", ""), "Redis image not redis"
    assert "6379" in str(redis_svc.get("ports", [])), "Missing port 6379"


def test_ci_yml_backend_env_vars():
    """CI-001: backend job sets required env vars."""
    ci = read_ci_yml()
    backend = ci["jobs"]["test-backend"]

    # Merge job-level env and step-level env for validation
    env = backend.get("env", {})

    assert env.get("MONGODB_URL") == "mongodb://localhost:27017"
    assert env.get("DB_NAME") == "sphere_test"
    assert env.get("REDIS_URL") == "redis://localhost:6379/0"
    assert str(env.get("PYTHONUNBUFFERED")) == "1"
    assert env.get("ENVIRONMENT") == "development"

    # Stripe: sin estas dos, settings.stripe_configured es False y billing.py
    # corta con 503 antes de llegar a los mocks — 6 tests en rojo por entorno.
    # Deben ser literales falsos: si alguien los cambia por ${{ secrets.* }},
    # CI pasaría a poder tocar Stripe de verdad.
    for key, prefix in (
        ("STRIPE_SECRET_KEY", "sk_test_"),
        ("STRIPE_WEBHOOK_SECRET", "whsec_"),
    ):
        value = env.get(key)
        assert value is not None, f"Falta {key} en el env: del job test-backend"
        value = str(value)
        assert value.strip(), f"{key} está vacío: stripe_configured seguiría en False"
        assert "${{" not in value, (
            f"{key} referencia un secreto del repositorio ({value!r}). "
            f"CI debe usar credenciales falsas en claro, nunca reales."
        )
        assert value.startswith(prefix), (
            f"{key} debe ser una credencial de test con prefijo {prefix!r}, "
            f"got: {value!r}"
        )


def test_ci_yml_has_frontend_job():
    """CI-002: test-frontend job exists with node 20 matrix."""
    ci = read_ci_yml()
    jobs = ci["jobs"]
    frontend = jobs["test-frontend"]

    matrix = frontend["strategy"]["matrix"]
    assert 20 in matrix["node-version"]


def test_ci_yml_has_lint_job_non_blocking():
    """CI-003: lint job exists with continue-on-error."""
    ci = read_ci_yml()
    lint = ci["jobs"]["lint"]
    assert lint.get("continue-on-error") is True, "Lint must be non-blocking"


def test_ci_yml_has_cache_for_pip():
    """CI-004: pip cache configured in backend job."""
    ci = read_ci_yml()
    backend = ci["jobs"]["test-backend"]
    steps = backend["steps"]
    cache_steps = [
        s for s in steps
        if isinstance(s.get("uses", ""), str) and "cache" in s.get("uses", "")
    ]
    assert len(cache_steps) >= 1, "At least one cache step expected"


# ── T-002: Dependency Pinning ─────────────────────────────────────────


def read_requirements_txt() -> list[tuple[str, str | None]]:
    """Parse requirements.txt, return list of (original_line, package_name, version_spec)."""
    path = ROOT / "backend" / "requirements.txt"
    if not path.exists():
        raise FileNotFoundError(f"requirements.txt not found at {path}")
    entries = []
    with open(path) as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                entries.append((raw, None))
                continue
            # Handle extras: "package[extra]==1.0" -> name="package[extra]"
            entries.append((raw, line))
    return entries  # type:ignore


def test_requirements_txt_all_pinned():
    """IN-002: all 43 packages have exact ==x.y.z versions (no >=, ~=, unversioned)."""
    entries = read_requirements_txt()
    unpinned = []
    for raw_line, parsed in entries:
        if parsed is None:
            continue  # comment / blank
        # Check for version specifier
        if "==" not in parsed:
            unpinned.append(parsed)
        elif ">=" in parsed or "<=" in parsed or "~=" in parsed or "!=" in parsed:
            unpinned.append(parsed)
    # Also verify no bare package names (without any version)
    assert len(unpinned) == 0, (
        f"Unpinned packages found: {unpinned}\n"
        f"All packages must use exact ==x.y.z versions."
    )


def test_requirements_txt_has_header_comment():
    """IN-002: header comment documents generation platform."""
    path = ROOT / "backend" / "requirements.txt"
    with open(path) as f:
        first_lines = "".join(f.readline() for _ in range(5))
    assert "Generated" in first_lines or "pinned" in first_lines.lower(), (
        "requirements.txt should have a header comment documenting generation platform"
    )


# ── T-003: n8n persistence + HEALTHCHECK ──────────────────────────────


def read_dockerfile(path: Path) -> list[str]:
    """Read a Dockerfile, return non-empty, non-comment lines."""
    with open(path) as f:
        return [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]


def test_dockerfile_n8n_has_volume():
    """IN-001: Dockerfile.n8n declares VOLUME /home/node/.n8n."""
    path = ROOT / "Dockerfile.n8n"
    lines = read_dockerfile(path)
    volume_lines = [l for l in lines if l.upper().startswith("VOLUME ")]
    assert len(volume_lines) >= 1, "Missing VOLUME directive in Dockerfile.n8n"
    assert any("/home/node/.n8n" in vl for vl in volume_lines), (
        f"VOLUME must point to /home/node/.n8n, got: {volume_lines}"
    )


def test_dockerfile_n8n_has_healthcheck():
    """IN-003: Dockerfile.n8n includes HEALTHCHECK targeting /healthz."""
    path = ROOT / "Dockerfile.n8n"
    lines = read_dockerfile(path)
    health_lines = [l for l in lines if l.upper().startswith("HEALTHCHECK ")]
    assert len(health_lines) >= 1, "Missing HEALTHCHECK in Dockerfile.n8n"
    combined = " ".join(health_lines)
    assert "5678" in combined or "healthz" in combined, (
        f"HEALTHCHECK must target port 5678/healthz, got: {health_lines}"
    )
    assert "interval" in combined.lower()
    assert "retries" in combined.lower()


def test_railway_toml_has_volume_mount():
    """IN-001: root railway.toml declares deploy.volume for n8n persistence."""
    path = ROOT / "railway.toml"
    with open(path) as f:
        content = f.read()
    assert "[deploy.volume]" in content, "Missing [deploy.volume] section in railway.toml"
    assert "mountPath" in content, "Missing mountPath in [deploy.volume]"


# ── T-004: Frontend startCommand ──────────────────────────────────────


def test_frontend_railway_toml_no_start_command():
    """IN-004: frontend/railway.toml must NOT contain startCommand."""
    path = ROOT / "frontend" / "railway.toml"
    with open(path) as f:
        content = f.read()
    assert "startCommand" not in content, (
        "startCommand should be removed from frontend/railway.toml — "
        "the Dockerfile CMD handles the process instead."
    )


# ── T-005: Backend HEALTHCHECK ────────────────────────────────────────


def test_backend_dockerfile_has_healthcheck():
    """IN-003: backend/Dockerfile includes HEALTHCHECK with curl."""
    path = ROOT / "backend" / "Dockerfile"
    lines = read_dockerfile(path)
    health_lines = [l for l in lines if l.upper().startswith("HEALTHCHECK ")]
    assert len(health_lines) >= 1, "Missing HEALTHCHECK in backend/Dockerfile"
    combined = " ".join(health_lines)
    assert "curl" in combined, "HEALTHCHECK must use curl"
    assert "health" in combined.lower(), "HEALTHCHECK must target /health endpoint"
    assert "interval" in combined.lower()
    assert "retries" in combined.lower()


def test_backend_dockerfile_has_curl_installed():
    """T-005: curl must be installed in final stage (RUN apt-get curl)."""
    path = ROOT / "backend" / "Dockerfile"
    lines = read_dockerfile(path)
    curl_lines = [l for l in lines if "curl" in l and ("apt" in l.lower() or "install" in l.lower())]
    assert len(curl_lines) >= 1, "curl must be installed via apt-get in backend/Dockerfile"


# ── T-006: VITE_API_URL runtime + frontend HEALTHCHECK ────────────────


def test_frontend_dockerfile_no_hardcoded_vite_api_url():
    """IN-005: frontend Dockerfile must NOT have ARG/ENV VITE_API_URL with
    a hardcoded URL (e.g., http://localhost:8000). It should use
    __VITE_API_URL__ placeholder instead."""
    path = ROOT / "frontend" / "Dockerfile"
    lines = read_dockerfile(path)
    for line in lines:
        upper = line.upper()
        if "ARG VITE_API_URL" in upper or "ENV VITE_API_URL" in upper:
            if "localhost" in line.lower() and "__VITE_API_URL__" not in line:
                raise AssertionError(
                    f"Dockerfile must not hardcode localhost in VITE_API_URL: {line}"
                )
            if "__VITE_API_URL__" not in line:
                raise AssertionError(
                    f"ARG/ENV VITE_API_URL without __VITE_API_URL__ placeholder: {line}"
                )


def test_frontend_dockerfile_uses_placeholder_in_build():
    """IN-005: npm run build uses VITE_API_URL=__VITE_API_URL__ as placeholder."""
    path = ROOT / "frontend" / "Dockerfile"
    with open(path) as f:
        content = f.read()
    assert "__VITE_API_URL__" in content, (
        "Dockerfile must use __VITE_API_URL__ placeholder during build"
    )


def test_frontend_dockerfile_has_no_healthcheck():
    """IN-003 (revisado 2026-07-12): el frontend NO debe llevar HEALTHCHECK de
    Docker. El commit 5ec712f lo retiró deliberadamente tras un incidente real:
    el healthcheck competía con el probe de Railway y Docker mataba el
    contenedor como unhealthy antes de que Railway lo verificara. La salud la
    comprueba Railway vía healthcheckPath en frontend/railway.toml."""
    path = ROOT / "frontend" / "Dockerfile"
    lines = read_dockerfile(path)
    health_lines = [l for l in lines if l.upper().startswith("HEALTHCHECK ")]
    assert len(health_lines) == 0, (
        f"frontend/Dockerfile no debe tener HEALTHCHECK (ver 5ec712f): {health_lines}"
    )
    railway = (ROOT / "frontend" / "railway.toml").read_text()
    assert "healthcheckPath" in railway, (
        "Sin HEALTHCHECK de Docker, frontend/railway.toml debe definir healthcheckPath"
    )


def test_nginx_conf_template_has_sub_filter():
    """IN-005: nginx.conf.template uses sub_filter for VITE_API_URL."""
    path = ROOT / "frontend" / "nginx.conf.template"
    with open(path) as f:
        content = f.read()
    assert "sub_filter '__VITE_API_URL__'" in content, (
        "nginx template must sub_filter __VITE_API_URL__ placeholder"
    )
    assert "sub_filter_types" in content, (
        "nginx template must include sub_filter_types directive (application/javascript)"
    )


# ── T-007: Frontend test scripts ──────────────────────────────────────


def test_frontend_package_json_has_test_scripts():
    """IN-007: frontend/package.json scripts include test and test:coverage."""
    path = ROOT / "frontend" / "package.json"
    with open(path) as f:
        pkg = json.load(f)
    scripts = pkg.get("scripts", {})
    assert "test" in scripts, "Missing 'test' script in frontend/package.json"
    assert "vitest" in scripts["test"], (
        f"'test' script must run vitest, got: {scripts.get('test')}"
    )
    assert "test:coverage" in scripts, (
        "Missing 'test:coverage' script in frontend/package.json"
    )
    assert "coverage" in scripts["test:coverage"].lower(), (
        f"'test:coverage' must include coverage flag"
    )


# ── T-008: Backend .dockerignore optimization ─────────────────────────


def test_backend_dockerignore_excludes_non_runtime():
    """IN-006: backend/.dockerignore must exclude tests/, docs/,
    credentials/, scripts/, *.md, and specific known-MD files."""
    path = ROOT / "backend" / ".dockerignore"
    with open(path) as f:
        content = f.read()
    required_patterns = [
        "tests/",
        "docs/",
        "credentials/",
        "scripts/",
        "*.md",
    ]
    missing = []
    for pat in required_patterns:
        if pat not in content:
            missing.append(pat)
    assert len(missing) == 0, (
        f"Missing .dockerignore patterns: {missing}"
    )
    # Also verify specific MD files
    for filename in ["ARCHITECTURE.md", "PLAN_PAGOS.md", "SETUP.md",
                     "RAILWAY.md", "ragnarok_deploy.md", "ragnaroc_plan.md"]:
        if filename.lower() not in content.lower():
            missing.append(filename)
    assert len(missing) == 0, (
        f"Missing specific MD file exclusions: {missing}"
    )


# ── Sanity ────────────────────────────────────────────────────────────


def test_test_file_itself_loads():
    """Self-check: this test module loads without error."""
    assert ROOT.joinpath(".git").is_dir(), "ROOT should point to repo root"
