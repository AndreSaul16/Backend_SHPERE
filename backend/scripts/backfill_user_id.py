"""
Script de migración retroactiva: añade user_id a documentos existentes.
Ejecutar UNA VEZ después de desplegar la multi-tenancy.

Uso:
    python backend/scripts/backfill_user_id.py --owner-uid <firebase_uid>
    python backend/scripts/backfill_user_id.py --dry-run
"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

# Añadir el directorio backend al path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from app.infrastructure.database import db


COLLECTIONS_TO_BACKFILL = [
    "knowledge_base",
    "custom_agents",
    "sessions_metadata",
    "agent_tasks",
    "message_ratings",
    "tool_audit_log",
]


async def backfill(owner_uid: str, dry_run: bool = False):
    """Añade user_id/owner_user_id a todos los documentos existentes."""
    async_db = db.get_async_db()

    total_updated = 0

    for collection_name in COLLECTIONS_TO_BACKFILL:
        col = async_db[collection_name]

        # Contar documentos sin user_id
        # `agent_tasks` va con `custom_agents`: su índice es sobre
        # `owner_user_id` (main.py) y sus tools filtran por ese campo.
        if collection_name in ("custom_agents", "agent_tasks"):
            query = {"owner_user_id": {"$exists": False}}
            field = "owner_user_id"
        else:
            query = {"user_id": {"$exists": False}}
            field = "user_id"

        count = await col.count_documents(query)

        if count == 0:
            print(f"  ✓ {collection_name}: ya tiene {field} en todos los documentos")
            continue

        print(f"  → {collection_name}: {count} documentos sin {field}")

        if dry_run:
            print(f"    [DRY RUN] Se actualizarían {count} documentos")
            total_updated += count
            continue

        result = await col.update_many(query, {"$set": {field: owner_uid}})
        print(f"    ✓ Actualizados: {result.modified_count}")
        total_updated += result.modified_count

    # GridFS agent_files
    agent_files_col = async_db["agent_files.files"]
    query = {"metadata.user_id": {"$exists": False}}
    count = await agent_files_col.count_documents(query)

    if count > 0:
        print(f"  → agent_files.files: {count} archivos sin metadata.user_id")
        if not dry_run:
            result = await agent_files_col.update_many(
                query, {"$set": {"metadata.user_id": owner_uid}}
            )
            print(f"    ✓ Actualizados: {result.modified_count}")
            total_updated += result.modified_count

    # Checkpoints (solo los que no tienen formato user_id:session_id)
    checkpoints_col = async_db["checkpoints"]
    async for doc in checkpoints_col.find({}):
        thread_id = doc.get("thread_id", "")
        if ":" not in thread_id:
            new_thread_id = f"{owner_uid}:{thread_id}"
            if not dry_run:
                await checkpoints_col.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"thread_id": new_thread_id}}
                )
            print(f"  → checkpoint thread_id: {thread_id} → {new_thread_id}")
            total_updated += 1

    # Knowledge base con user_id
    kb_col = async_db["knowledge_base"]
    kb_query = {"user_id": {"$exists": False}}
    kb_count = await kb_col.count_documents(kb_query)
    if kb_count > 0:
        print(f"  → knowledge_base: {kb_count} vectores sin user_id")
        if not dry_run:
            result = await kb_col.update_many(kb_query, {"$set": {"user_id": owner_uid}})
            print(f"    ✓ Actualizados: {result.modified_count}")
            total_updated += result.modified_count

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Total actualizados: {total_updated}")


async def main():
    parser = argparse.ArgumentParser(description="Backfill user_id en documentos existentes")
    parser.add_argument("--owner-uid", help="Firebase UID del owner de dev")
    parser.add_argument("--dry-run", action="store_true", help="Solo contar, no modificar")
    args = parser.parse_args()

    if not args.dry_run and not args.owner_uid:
        print("ERROR: --owner-uid es obligatorio (o usa --dry-run)")
        sys.exit(1)

    owner_uid = args.owner_uid or "dry-run-user"

    print(f"{'[DRY RUN] ' if args.dry_run else ''}Backfill user_id: {owner_uid}")
    print("=" * 60)

    db.connect()
    await backfill(owner_uid, dry_run=args.dry_run)
    db.close()

    print("\n✅ Migración completada")


if __name__ == "__main__":
    asyncio.run(main())
