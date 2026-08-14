"""
Credit Manager: gestión atómica de saldo de mensajes.

Patrón: débito atómico al inicio + refund-on-error + ajuste post-inferencia.

Atomicidad: no usamos pipeline + cleanup de campo temporal (que filtra estado
intermedio). En su lugar dos `find_one_and_update` con condición $gte: primero
contra el plan, fallback al top-up. Cada uno es atómico de por sí.
"""
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel
from pymongo import ReturnDocument


class InsufficientCreditsError(Exception):
    """Lanzada cuando no hay saldo suficiente en plan ni top-up."""


class ChargeContext(BaseModel):
    tx_id: str
    user_id: str
    cost: int
    source: str  # "plan" | "topup"
    counted_as: int


# Coste estimado USD por mensaje DeepSeek V4 Pro (asumiendo ~1k in + 1k out).
COST_USD_ESTIMATED_PER_MESSAGE = 0.004
# Cap de tokens por mensaje. >cap → cuenta como 2.
TOKEN_CAP_PER_MESSAGE = 4000
# Un board meeting ejecuta ~5 agentes (CEO/CTO/CFO/CMO + conclusión) ×(1-2 iter),
# por lo que consume ~5× el cómputo de un chat normal. Se cobra como 5 créditos.
BOARD_MEETING_COST = 5
# Board V2: si el triage reduce el debate a 2 directores, el coste efectivo baja a 3
# (se reembolsan 2 créditos). Ver CreditManager.partial_refund.
BOARD_REDUCED_COST = 3


class CreditManager:
    def __init__(self, db):
        self.db = db
        self.users_collection = db["users"]
        self.transactions_collection = db["credit_transactions"]

    # --- Public sync API (para usar desde rutas sync o tests). ---

    def reserve_and_charge(
        self,
        user_id: str,
        agent_id: str,
        model: str,
        request_id: Optional[str] = None,
        is_board: bool = False,
    ) -> ChargeContext:
        """Operación atómica: chequea y deduce el coste (1 mensaje normal, 5 si es
        board meeting). Lanza InsufficientCreditsError si no hay saldo."""
        cost = self._resolve_cost(agent_id, model, is_board=is_board)

        # 1) Intentar plan primero.
        result = self.users_collection.find_one_and_update(
            {"firebase_uid": user_id, "wallet.pro_messages_balance": {"$gte": cost}},
            {"$inc": {"wallet.pro_messages_balance": -cost}},
            return_document=ReturnDocument.AFTER,
        )
        source = "plan"
        balance_after = None

        if result:
            balance_after = (result.get("wallet") or {}).get("pro_messages_balance", 0)
        else:
            # 2) Fallback a top-up.
            result = self.users_collection.find_one_and_update(
                {"firebase_uid": user_id, "wallet.topup_messages_balance": {"$gte": cost}},
                {"$inc": {"wallet.topup_messages_balance": -cost}},
                return_document=ReturnDocument.AFTER,
            )
            if not result:
                raise InsufficientCreditsError("No balance available in plan nor top-ups.")
            source = "topup"
            balance_after = (result.get("wallet") or {}).get("topup_messages_balance", 0)

        tx_id = f"tx_{uuid.uuid4().hex}"
        self.transactions_collection.insert_one({
            "_id": tx_id,
            "user_id": user_id,
            "delta": -cost,
            "balance_after": balance_after,
            "balance_source": source,
            "reason": "inference",
            "request_id": request_id,
            "agent_id": agent_id,
            "model": model,
            "counted_as_messages": cost,
            "cost_usd_estimated": COST_USD_ESTIMATED_PER_MESSAGE * cost,
            "created_at": datetime.now(timezone.utc),
        })

        return ChargeContext(
            tx_id=tx_id,
            user_id=user_id,
            cost=cost,
            source=source,
            counted_as=cost,
        )

    def adjust_after_completion(
        self,
        ctx: ChargeContext,
        tokens_in: int,
        tokens_out: int,
        cost_usd_actual: float,
    ):
        """
        Tras inferencia exitosa: si total_tokens > 4000, cobra 1 mensaje extra.
        Si el usuario no tiene saldo para el extra, queda como deuda registrada
        en el log (campo `extra_charge_outstanding=True`) para reconciliar
        después en el próximo intento de cobro o desde el panel admin.
        """
        tokens_total = tokens_in + tokens_out
        extra_collected = 0
        extra_outstanding = False

        if tokens_total > TOKEN_CAP_PER_MESSAGE and ctx.counted_as == 1:
            extra_charged = self._charge_extra(ctx)
            if extra_charged:
                extra_collected = 1
            else:
                extra_outstanding = True

        self.transactions_collection.update_one(
            {"_id": ctx.tx_id},
            {"$set": {
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "tokens_total": tokens_total,
                "cost_usd_actual": cost_usd_actual,
                "counted_as_messages": ctx.counted_as + extra_collected,
                "extra_charge_outstanding": extra_outstanding,
            }},
        )

    def refund(self, ctx: ChargeContext, reason: str = "inference_failed"):
        """Devuelve el mensaje al usuario (al mismo bucket donde se cobró)."""
        field = (
            "wallet.pro_messages_balance"
            if ctx.source == "plan"
            else "wallet.topup_messages_balance"
        )
        self.users_collection.update_one(
            {"firebase_uid": ctx.user_id},
            {"$inc": {field: ctx.cost}},
        )
        self.transactions_collection.insert_one({
            "_id": f"tx_{uuid.uuid4().hex}",
            "user_id": ctx.user_id,
            "delta": ctx.cost,
            "balance_source": ctx.source,
            "reason": reason,
            "ref_tx_id": ctx.tx_id,
            "created_at": datetime.now(timezone.utc),
        })

    def partial_refund(self, ctx: ChargeContext, amount: int, reason: str = "board_triage_reduced"):
        """Devuelve PARTE del cobro (al mismo bucket). Usado cuando el triage del board
        reduce el nº de directores (5 → 3 créditos): se reembolsan los créditos sobrantes.
        amount se clampa a [0, ctx.cost] para no devolver de más."""
        amount = max(0, min(int(amount), ctx.cost))
        if amount == 0:
            return
        field = (
            "wallet.pro_messages_balance"
            if ctx.source == "plan"
            else "wallet.topup_messages_balance"
        )
        self.users_collection.update_one(
            {"firebase_uid": ctx.user_id},
            {"$inc": {field: amount}},
        )
        self.transactions_collection.insert_one({
            "_id": f"tx_{uuid.uuid4().hex}",
            "user_id": ctx.user_id,
            "delta": amount,
            "balance_source": ctx.source,
            "reason": reason,
            "ref_tx_id": ctx.tx_id,
            "created_at": datetime.now(timezone.utc),
        })

    # --- Async wrappers para uso desde FastAPI / orchestrator. ---

    async def areserve_and_charge(
        self,
        user_id: str,
        agent_id: str,
        model: str,
        request_id: Optional[str] = None,
        is_board: bool = False,
    ) -> ChargeContext:
        return await asyncio.to_thread(
            self.reserve_and_charge, user_id, agent_id, model, request_id, is_board
        )

    async def aadjust_after_completion(
        self,
        ctx: ChargeContext,
        tokens_in: int,
        tokens_out: int,
        cost_usd_actual: float,
    ):
        return await asyncio.to_thread(
            self.adjust_after_completion, ctx, tokens_in, tokens_out, cost_usd_actual
        )

    async def arefund(self, ctx: ChargeContext, reason: str = "inference_failed"):
        return await asyncio.to_thread(self.refund, ctx, reason)

    async def apartial_refund(self, ctx: ChargeContext, amount: int, reason: str = "board_triage_reduced"):
        return await asyncio.to_thread(self.partial_refund, ctx, amount, reason)

    # --- Helpers privados. ---

    def _resolve_cost(self, agent_id: str, model: str, is_board: bool = False) -> int:
        # Chat normal (1 agente) = 1 crédito. Board meeting = 5 créditos (~5× cómputo).
        # Si en el futuro se introducen modelos con coste distinto, cambiar aquí.
        return BOARD_MEETING_COST if is_board else 1

    def _charge_extra(self, ctx: ChargeContext) -> bool:
        """
        Intenta cobrar 1 mensaje adicional (tras superar el cap de 4k tokens).
        Devuelve True si se cobró, False si no hay saldo (queda como deuda).
        """
        # Plan primero, luego top-up. Sin silent fail: si ambos fallan, devolvemos False.
        result = self.users_collection.find_one_and_update(
            {"firebase_uid": ctx.user_id, "wallet.pro_messages_balance": {"$gte": 1}},
            {"$inc": {"wallet.pro_messages_balance": -1}},
            return_document=ReturnDocument.AFTER,
        )
        source = "plan"
        if not result:
            result = self.users_collection.find_one_and_update(
                {"firebase_uid": ctx.user_id, "wallet.topup_messages_balance": {"$gte": 1}},
                {"$inc": {"wallet.topup_messages_balance": -1}},
                return_document=ReturnDocument.AFTER,
            )
            source = "topup"
        if not result:
            return False

        self.transactions_collection.insert_one({
            "_id": f"tx_{uuid.uuid4().hex}",
            "user_id": ctx.user_id,
            "delta": -1,
            "balance_source": source,
            "reason": "inference_extra_tokens",
            "ref_tx_id": ctx.tx_id,
            "counted_as_messages": 1,
            "created_at": datetime.now(timezone.utc),
        })
        return True
