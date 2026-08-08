"""
Auditoría READ-ONLY de grants huérfanos.

Lista los documentos de `credit_transactions` cuyo `user_id` no existe en
`users.firebase_uid`: pagos que Stripe entregó, que el webhook reclamó y que
nunca llegaron a un wallet. Responde a la pregunta que el diseño dejó abierta —
con qué frecuencia pasa esto de verdad en la base real.

El script NO escribe: solo `aggregate` y `find`. No importa nada de `app/` para
poder correrlo contra producción sin arrastrar la configuración del servicio.

Pretil: `load_dotenv` carga el MISMO `.env` que la app, así que en una máquina de
producción este script apuntaría a producción sin que nadie lo pida. Antes de
conectar imprime el destino y exige `--yes` si la base no parece de test o si
`ENVIRONMENT` es producción. Sin `ENVIRONMENT` se asume producción, igual que
`app/core/config.py`.

Uso:
    MONGODB_URL=... DB_NAME=sphere_test ENVIRONMENT=development \
        python backend/scripts/audit_orphan_grants.py
    ... python backend/scripts/audit_orphan_grants.py --limit 50 --json
    ... python backend/scripts/audit_orphan_grants.py --yes   # producción, a sabiendas
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def describe_target(uri: str, db_name: str, environment: str) -> str:
    """Banner del destino, sin credenciales.

    Se imprime ANTES de conectar: saber a qué base fuiste después de haberla
    consultado no sirve de nada.
    """
    # mongodb://usuario:clave@host/... → mongodb://host/...
    safe_uri = re.sub(r"://[^/@]*@", "://", uri)
    return f"Destino: {safe_uri} — base {db_name!r} — ENVIRONMENT={environment}"


def guard_target(db_name: str, environment: str, confirmed: bool) -> str | None:
    """Devuelve None si se puede conectar, o el motivo del rechazo.

    Mismo criterio que `tests/conftest.py` para la suite (el nombre de la base
    tiene que parecer de test), más `ENVIRONMENT`. `--yes` es intención
    explícita: auditar producción es un uso legítimo, pero no accidental.
    """
    if confirmed:
        return None
    risks = []
    if "test" not in db_name.lower():
        risks.append(f"la base {db_name!r} no parece de test")
    if environment.lower() == "production":
        risks.append("ENVIRONMENT=production")
    if not risks:
        return None
    return (
        "Conexión no confirmada: " + " y ".join(risks) + ".\n"
        "Si de verdad quieres auditar este destino, repite el comando con --yes."
    )


def find_orphan_grants(dbc, limit: int) -> list[dict]:
    """Devuelve los claims cuyo user_id no tiene perfil. Solo lectura.

    $lookup contra `users` en vez de traerse toda la colección: la lista de
    firebase_uid puede no caber en memoria en producción.
    """
    pipeline = [
        {"$match": {"user_id": {"$type": "string"}}},
        {"$lookup": {
            "from": "users",
            "localField": "user_id",
            "foreignField": "firebase_uid",
            "as": "_profile",
        }},
        {"$match": {"_profile": {"$size": 0}}},
        {"$sort": {"created_at": -1}},
        {"$limit": limit},
        {"$project": {"_profile": 0}},
    ]
    return list(dbc["credit_transactions"].aggregate(pipeline))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=100,
                        help="máximo de filas a listar (por defecto 100)")
    parser.add_argument("--json", action="store_true",
                        help="salida JSON en vez de tabla")
    parser.add_argument("--yes", action="store_true",
                        help="confirmar el destino cuando no parece una base de test")
    args = parser.parse_args()

    uri = os.getenv("MONGODB_URL")
    db_name = os.getenv("DB_NAME")
    if not uri or not db_name:
        print("Faltan MONGODB_URL y/o DB_NAME en el entorno.", file=sys.stderr)
        return 2

    # Default fail-closed, igual que config.py: sin ENVIRONMENT, producción.
    environment = os.getenv("ENVIRONMENT", "production")
    # A stderr: es diagnóstico, no datos. En stdout rompería `--json | jq` y,
    # por el buffering de stdout, se imprimiría DESPUÉS del rechazo de abajo.
    print(describe_target(uri, db_name, environment), file=sys.stderr)
    rejection = guard_target(db_name, environment, args.yes)
    if rejection:
        print(rejection, file=sys.stderr)
        return 3

    client = MongoClient(uri)
    try:
        dbc = client[db_name]
        orphans = find_orphan_grants(dbc, args.limit)
        total = dbc["credit_transactions"].count_documents({})

        if args.json:
            print(json.dumps(
                [{k: str(v) for k, v in doc.items()} for doc in orphans],
                indent=2, ensure_ascii=False,
            ))
        else:
            print(f"{total} credit_transactions en total")
            print(f"Grants huérfanos encontrados: {len(orphans)}"
                  + (f" (limitado a {args.limit})" if len(orphans) == args.limit else ""))
            if orphans:
                print(f"\n{'stripe_event_id':<34} {'user_id':<30} {'delta':>7}  reason")
                print("-" * 92)
                for doc in orphans:
                    print(f"{str(doc.get('stripe_event_id')):<34} "
                          f"{str(doc.get('user_id')):<30} "
                          f"{str(doc.get('delta')):>7}  {doc.get('reason')}")
            print("\nSolo lectura: este script no ha modificado ningún documento.")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
