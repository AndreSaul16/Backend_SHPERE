import stripe

from app.core.config import settings
from app.core.plan_limits import PURCHASABLE_SKUS

stripe.api_key = settings.STRIPE_SECRET_KEY


# Mapeo SKU -> Price ID de Stripe.
# Se rellenan desde .env tras crearlos en el dashboard Stripe.
# Modelo solo-créditos: todos los SKUs son compras puntuales (mode=payment).
def _price_map() -> dict[str, str]:
    return {
        # Packs de recarga
        "executive": settings.STRIPE_PRICE_EXECUTIVE,
        "director": settings.STRIPE_PRICE_DIRECTOR,
        "boardroom": settings.STRIPE_PRICE_BOARDROOM,
        # Top-ups rápidos
        "quick_meeting": settings.STRIPE_PRICE_QUICK_MEETING,
        "deep_dive": settings.STRIPE_PRICE_DEEP_DIVE,
    }


def purchasable_skus() -> list[str]:
    """SKUs del catálogo que HOY se pueden comprar de verdad.

    Un SKU de `PURCHASABLE_SKUS` sólo es comprable si tiene un price ID de
    Stripe detrás. Los `STRIPE_PRICE_*` vienen del entorno con default `""` y no
    se validan al arranque, así que un despliegue puede tener `STRIPE_SECRET_KEY`
    puesta —`stripe_configured` a True, catálogo entero pintado— y ningún precio
    configurado: el clic se va entonces al `ValueError` de
    `create_checkout_session` y sale un 400 BILLING_INVALID_PLAN. El producto
    prometía cinco compras y no podía cumplir ninguna.

    Sin `STRIPE_SECRET_KEY` no se promete nada aunque haya precios: `/checkout`
    corta antes con un 503.

    Función pura sobre la configuración, y el resultado va ordenado: es cuerpo de
    respuesta HTTP, y un `set` daría un orden distinto en cada proceso.
    """
    if not settings.stripe_configured:
        return []
    prices = _price_map()
    return sorted(sku for sku in PURCHASABLE_SKUS if (prices.get(sku) or "").strip())


class StripeClient:
    @staticmethod
    def create_checkout_session(user_id: str, plan_id: str, customer_email: str) -> str:
        prices = _price_map()
        price_id = prices.get(plan_id)
        if not price_id:
            raise ValueError(f"Invalid or unconfigured plan_id: {plan_id}")

        # No hay suscripciones: toda compra de créditos es one-time (payment).
        params = {
            "payment_method_types": ["card"],
            "line_items": [{"price": price_id, "quantity": 1}],
            "mode": "payment",
            "success_url": f"{settings.FRONTEND_URL}/billing?success=true",
            "cancel_url": f"{settings.FRONTEND_URL}/billing?canceled=true",
            "client_reference_id": user_id,
            "customer_email": customer_email,
            "automatic_tax": {"enabled": True},
            # Metadata en la session: el webhook lee plan_id desde aquí.
            "metadata": {"plan_id": plan_id, "user_id": user_id},
            "payment_intent_data": {
                "metadata": {"plan_id": plan_id, "user_id": user_id}
            },
        }

        session = stripe.checkout.Session.create(**params)
        return session.url

    @staticmethod
    def create_billing_portal_session(stripe_customer_id: str) -> str:
        session = stripe.billing_portal.Session.create(
            customer=stripe_customer_id,
            return_url=f"{settings.FRONTEND_URL}/billing",
        )
        return session.url
