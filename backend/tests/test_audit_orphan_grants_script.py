"""Pretil del script de auditoría: no puede apuntar a producción por accidente.

`audit_orphan_grants.py` hace `load_dotenv` del MISMO `.env` que carga la app,
así que en una máquina con el `.env` de producción se conecta a producción sin
que nadie lo pida. Es read-only, pero `--json` vuelca `user_id` y
`stripe_event_id` a stdout.

El criterio es el mismo que `tests/conftest.py` aplica a la suite (el nombre de
la base tiene que parecer de test), más `ENVIRONMENT`, y con la misma política
fail-closed que `config.py`: si nadie lo dice, se asume producción.
"""
import pytest

from scripts.audit_orphan_grants import describe_target, guard_target


# ── guard_target: devuelve None si se puede conectar, o el motivo del rechazo ──

def test_guard_allows_test_database_in_development():
    assert guard_target("sphere_test", "development", confirmed=False) is None


def test_guard_blocks_database_that_does_not_look_like_test():
    reason = guard_target("sphere_db", "development", confirmed=False)
    assert reason is not None
    assert "sphere_db" in reason
    assert "--yes" in reason


def test_guard_blocks_production_environment_even_on_a_test_database():
    reason = guard_target("sphere_test", "production", confirmed=False)
    assert reason is not None
    assert "ENVIRONMENT=production" in reason


def test_guard_reports_both_reasons_at_once():
    reason = guard_target("sphere_db", "production", confirmed=False)
    assert "sphere_db" in reason
    assert "ENVIRONMENT=production" in reason


def test_guard_yields_to_explicit_confirmation():
    # --yes es intención explícita: auditar producción es un uso legítimo.
    assert guard_target("sphere_db", "production", confirmed=True) is None


# ── describe_target: se imprime ANTES de conectar y sin credenciales ──────────

def test_describe_target_names_host_and_database():
    banner = describe_target("mongodb://mongo.prod.internal:27017", "sphere_db", "production")
    assert "mongo.prod.internal:27017" in banner
    assert "sphere_db" in banner
    assert "production" in banner


def test_describe_target_redacts_credentials():
    banner = describe_target(
        "mongodb://admin:s3cr3t@mongo.prod.internal:27017/?tls=true",
        "sphere_db", "production",
    )
    assert "s3cr3t" not in banner
    assert "admin" not in banner
    assert "mongo.prod.internal:27017" in banner


# ── main: el destino se imprime antes de abrir la conexión ───────────────────

def test_main_prints_destination_before_connecting(monkeypatch, capsys):
    """El banner tiene que salir aunque la conexión reviente: hoy el nombre de
    la base se imprimía DESPUÉS de haber consultado."""
    from scripts import audit_orphan_grants as script

    monkeypatch.setenv("MONGODB_URL", "mongodb://mongo.prod.internal:27017")
    monkeypatch.setenv("DB_NAME", "sphere_db")
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setattr("sys.argv", ["audit_orphan_grants.py", "--yes"])

    class _Boom(Exception):
        pass

    def _explode(*a, **kw):
        raise _Boom("no debería llegar aquí sin haber avisado del destino")

    monkeypatch.setattr(script, "MongoClient", _explode)

    with pytest.raises(_Boom):
        script.main()

    # A stderr: el banner es diagnóstico, no datos — en stdout rompería
    # `--json | jq` y el buffering lo sacaría después del rechazo.
    err = capsys.readouterr().err
    assert "mongo.prod.internal:27017" in err
    assert "sphere_db" in err


def test_main_refuses_and_never_connects_without_confirmation(monkeypatch, capsys):
    from scripts import audit_orphan_grants as script

    monkeypatch.setenv("MONGODB_URL", "mongodb://mongo.prod.internal:27017")
    monkeypatch.setenv("DB_NAME", "sphere_db")
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setattr("sys.argv", ["audit_orphan_grants.py"])

    def _explode(*a, **kw):
        raise AssertionError("el script conectó pese a no estar confirmado")

    monkeypatch.setattr(script, "MongoClient", _explode)

    assert script.main() == 3
    captured = capsys.readouterr()
    assert "sphere_db" in captured.err
    assert "--yes" in captured.err
    # stdout limpio: nada que un `--json | jq` pueda tragarse por error.
    assert captured.out == ""


def test_main_defaults_to_production_when_environment_is_unset(monkeypatch):
    """Mismo default fail-closed que `config.py`: sin ENVIRONMENT, producción."""
    from scripts import audit_orphan_grants as script

    monkeypatch.setenv("MONGODB_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "sphere_test")
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.setattr("sys.argv", ["audit_orphan_grants.py"])

    def _explode(*a, **kw):
        raise AssertionError("el script conectó con ENVIRONMENT sin definir")

    monkeypatch.setattr(script, "MongoClient", _explode)

    assert script.main() == 3
