"""require_owner: verificación de propiedad de documentos (multi-tenant).

Un documento sin dueño (campo user_id ausente/None/"") no debe ser accesible
por ningún usuario autenticado — antes se saltaba la comprobación.
"""
import pytest
from fastapi import HTTPException

from app.core.tenant import require_owner


def test_owner_correcto_pasa():
    require_owner({"user_id": "u1", "data": 1}, "u1")  # no lanza


def test_owner_alterno_owner_user_id():
    require_owner({"owner_user_id": "u1"}, "u1")  # no lanza


def test_doc_none_es_404():
    with pytest.raises(HTTPException) as exc:
        require_owner(None, "u1")
    assert exc.value.status_code == 404


def test_dueno_distinto_es_404():
    with pytest.raises(HTTPException) as exc:
        require_owner({"user_id": "u2"}, "u1")
    assert exc.value.status_code == 404


@pytest.mark.parametrize("doc", [{}, {"user_id": None}, {"user_id": ""}, {"owner_user_id": None}])
def test_doc_sin_dueno_se_deniega(doc):
    # Regresión de seguridad: sin este check cualquier usuario accedía.
    with pytest.raises(HTTPException) as exc:
        require_owner(doc, "u1")
    assert exc.value.status_code == 404
