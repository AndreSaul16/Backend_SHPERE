# PLAN DE IMPLEMENTACIÓN DEL SISTEMA DE PAGOS (SPHERE)

> ⚠️ **SUPERSEDED (2026-07-12)**: el producto pivotó del modelo de 3 tiers con
> suscripción descrito aquí a un **modelo mono-plan de solo-créditos**: un único
> plan `free` (30 créditos/mes) + compras puntuales (packs y top-ups,
> `mode=payment`, sin suscripciones). La fuente de verdad actual es
> `app/core/config.py` (catálogo/precios) y `app/core/plan_limits.py` (límites).
> Este documento se conserva como referencia histórica de la estrategia; las
> secciones de tiers, feature gating por plan y suscripciones NO están vigentes.

Este documento detalla la estrategia financiera y técnica para integrar un sistema de pagos nativo y un sistema de cuotas de mensajes con feature gating. El objetivo es maximizar la rentabilidad (margen garantizado >50% en planes pagos worst-case) utilizando exclusivamente DeepSeek V4 Pro, manteniendo una arquitectura limpia y escalable.

---

## 1. LA ESTRATEGIA (El "Por Qué")

### 1.1 Decisión clave: una sola calidad

SPHERE ofrece **únicamente DeepSeek V4 Pro** en todos los planes (incluido Free). No se incluye Flash ni modelos baratos en ningún tier.

**Razones:**
- Branding limpio: "SPHERE = siempre la mejor calidad disponible".
- Coste predecible: cada mensaje cuesta lo mismo, sin riesgo de "Flash ilimitado" que erosione el margen (un Premium con Flash ilimitado se come el revenue neto del plan en 50k mensajes).
- Sin model picker en UI → schema, lógica y UX más simples.
- Sin riesgo de queja del tipo "habéis bajado la calidad" al cancelar plan.

### 1.2 Modelo de cobro

Vendemos **cuotas mensuales de mensajes Pro**. Coste API DeepSeek V4 Pro estimado: ~$0.004/mensaje (asumiendo ~1k tokens in + 1k tokens out).

**Cap de tokens por mensaje (protección de margen):**
- Mensaje con ≤4.000 tokens totales (in + out) = cuenta como **1 mensaje**.
- Mensaje con >4.000 tokens totales = cuenta como **2 mensajes**.
- Esto protege contra usuarios que pegan PDFs gigantes como contexto y queman el margen.

### 1.3 Tiers de precios (con IVA español 21% incluido)

Todos los precios mostrados incluyen IVA. El revenue neto que ingresamos es ~83% del precio bruto.

| Plan | Precio | Mensajes Pro/mes | RAG Storage | Agentes Custom | API | Top-ups |
|---|---|---|---|---|---|---|
| **Free** | €0 | 5 | 20 MB | ❌ | ❌ | ✅ (1 pack) |
| **Starter** | €9.99 | 1.000 | 100 MB | 3 max | ❌ | ✅ (1 pack) |
| **Premium** | €19.99 | 2.000 | 1 GB | ilimitados | ✅ (rate limited) | ✅ (3 packs) |

**Análisis de margen worst-case (100% utilization, IVA descontado):**
- Starter: ($8.93 - $4.00) / $8.93 = **55%** ✅
- Premium: ($17.85 - $8.00) / $17.85 = **55%** ✅
- Free: coste $0.02/usuario/mes (5 × $0.004). Trivial — hook de captación.

Con breakage típico SaaS (~30%), el margen real esperado sube a 70-80%.

### 1.4 Top-ups (packs adicionales)

Los top-ups tienen ~100% utilization (quien los compra los gasta), por eso los precios son menos agresivos que el plan base.

**Free (1 pack):**
- 100 mensajes Pro → **€4.99** (margen 91%)

**Starter (1 pack):**
- 700 mensajes Pro → **€5.99**

**Premium (3 packs):**
- 1.000 mensajes Pro → **€7.99** (margen 46%)
- 2.000 mensajes Pro → **€14.99** (margen 39%)
- 10.000 mensajes Pro → **€74.99** (margen 40%)

**Lógica de pricing (precio por mensaje, post-IVA):**
- Top-up Free: €0.0499/msg
- Top-up Starter: €0.00853/msg
- Plan Starter base: €0.00999/msg
- Top-ups Premium: €0.0079 a €0.0075/msg
- Plan Premium base: €0.00998/msg

El top-up Free es **5× más caro por mensaje** que Starter — esto es deliberado: protege el upgrade path. Quien necesita más de 100 mensajes/mes claramente debe pagar Starter. El top-up Free captura al usuario casual que solo quiere "un empujón puntual" sin suscripción mensual.

**Por qué los top-ups Premium son más caros proporcionalmente:** el coste de DeepSeek es lineal (no hay economía de escala en LLMs). Un descuento por volumen agresivo (como €50 por 10k) sería trabajar gratis.

**Caducidad de top-ups:**
- **Free**: no caducan mientras la cuenta exista (el plan free no tiene ciclo de renovación).
- **Starter / Premium**: no caducan mientras el plan esté activo. Si el usuario cancela y vuelve a free, los top-ups Starter/Premium se mantienen también (son mensajes ya pagados; sería abusivo expirarlos).

**Caps de features durante uso de top-ups:**
Los top-ups SOLO añaden mensajes. NO desbloquean features del siguiente plan. Un usuario Free con top-up sigue:
- Sin agentes custom.
- Limitado a 20 MB de RAG.
- Sin API access.
- Con rate limit de Free (10 req/min).

### 1.5 Política comercial (cerrada)

- **Carry-over**: NO. Los mensajes no consumidos se pierden al renovar (estándar SaaS — Cursor, ChatGPT Plus, Claude Pro).
- **Trial**: NO en v1. El free tier (5 Pro/mes) actúa como demo.
- **Cancelación**: el usuario mantiene acceso hasta `current_period_end`. Sin prorrateos de mensajes.
- **Downgrade mid-cycle**: aplica al siguiente ciclo. No se reembolsan mensajes ya consumidos.
- **Reembolsos**: cumplimiento UE — 14 días de derecho de desistimiento, salvo consentimiento explícito de consumir el servicio digital (checkbox obligatorio en checkout).
- **Reventa de API**: prohibida en TOS. Rate limit + cobro adicional sobre umbral.

---

## 2. ARQUITECTURA TÉCNICA (El "Cómo")

La implementación respeta la Clean Architecture establecida en SPHERE. Todo el sistema está desacoplado.

### 2.1 Base de datos (MongoDB)

#### Colección `users` (modificada)

```json
{
  "_id": "user_id",
  "firebase_uid": "...",
  "email": "...",
  "subscription": {
    "plan_id": "free | starter | premium",
    "status": "active | past_due | canceled",
    "stripe_customer_id": "cus_12345",
    "stripe_subscription_id": "sub_12345",
    "current_period_end": "ISO-Date",
    "cancel_at_period_end": false
  },
  "wallet": {
    "pro_messages_balance": 1000,
    "pro_messages_granted_this_period": 1000,
    "last_period_reset": "ISO-Date",
    "topup_messages_balance": 0
  },
  "limits": {
    "rag_storage_bytes_used": 0,
    "custom_agents_count": 0
  }
}
```

**Notas:**
- `pro_messages_balance` se decrementa con cada mensaje. Se resetea al renovar suscripción (o al consumir grant mensual).
- `topup_messages_balance` separado: los top-ups no se pierden al renovar mientras el plan siga activo (incentivo de compra).
- Orden de consumo: primero `pro_messages_balance` del plan, luego `topup_messages_balance`.

#### Colección `credit_transactions` (nueva — NO NEGOCIABLE)

Log auditable de cada movimiento de mensajes. Sin esto no se pueden auditar disputas, detectar erosión de margen ni dar soporte.

```json
{
  "_id": "tx_id",
  "user_id": "user_id",
  "delta": -1,
  "balance_after": 999,
  "balance_source": "plan | topup",
  "reason": "inference | topup_purchase | subscription_grant | refund | period_reset | manual_adjustment",
  "request_id": "req_xxx",
  "agent_id": "agent_xxx",
  "model": "deepseek-v4-pro",
  "tokens_in": 1234,
  "tokens_out": 567,
  "tokens_total": 1801,
  "counted_as_messages": 1,
  "cost_usd_estimated": 0.004,
  "cost_usd_actual": 0.0038,
  "stripe_event_id": null,
  "created_at": "ISO-Date"
}
```

Índices: `(user_id, created_at)`, `(stripe_event_id)`.

#### Colección `stripe_events_processed` (nueva — idempotencia)

```json
{
  "_id": "evt_xxxx",
  "type": "checkout.session.completed",
  "processed_at": "ISO-Date"
}
```

Índice único en `_id`. Antes de procesar un webhook, comprobar si el evento ya está en esta colección.

### 2.2 Backend (Python / FastAPI)

Ubicación: `backend/app/application/` y `backend/app/infrastructure/`.

#### A. Integración Stripe (Infrastructure)

**`app/infrastructure/stripe_client.py`:**
- `create_checkout_session(user_id, plan_id)`: crea Checkout Session con `client_reference_id = firebase_uid`. **Usar Checkout Sessions, NO Payment Links** — necesario para asociar pago al user_id.
- `create_billing_portal_session(stripe_customer_id)`: para que el usuario gestione su suscripción.
- Activar **Stripe Tax** para que calcule IVA español automáticamente.

**`app/presentation/api/v1/billing.py`:**
- `POST /billing/checkout`: devuelve URL de Checkout Session.
- `POST /billing/portal`: devuelve URL del Customer Portal.
- `GET /users/me/billing`: devuelve estado actual (plan, balance, fecha renovación, top-ups).

**`app/presentation/api/v1/webhooks.py`:**
- `POST /webhooks/stripe`: endpoint público para Stripe.
- **Verificación de firma obligatoria** con `Stripe-Signature` header y secret de webhook.
- **Idempotencia obligatoria**: comprobar `stripe_events_processed` antes de procesar.
- Eventos a manejar:
  - `checkout.session.completed` → crear/actualizar suscripción, otorgar mensajes del plan.
  - `customer.subscription.updated` → cambiar plan, ajustar cuotas.
  - `customer.subscription.deleted` → marcar como `canceled` al `period_end`.
  - `invoice.payment_failed` → marcar `past_due`, notificar al usuario.
  - `invoice.payment_succeeded` (renovación) → resetear `pro_messages_balance` al grant del plan.

#### B. Credit Manager (Application)

**`app/application/credit_manager.py`** — servicio central. Patrón **débito atómico al inicio + refund-on-error**.

```python
class CreditManager:
    def reserve_and_charge(self, user_id, agent_id, model) -> ChargeContext:
        """
        Operación atómica: chequea y deduce en un solo findOneAndUpdate.
        Si no hay saldo, lanza InsufficientCreditsError (HTTP 402).
        """
        cost = self._resolve_cost(agent_id, model)  # Por ahora siempre 1 (Pro = 1 msg)

        # findOneAndUpdate atómico — race-condition free
        result = users.find_one_and_update(
            {
                "_id": user_id,
                "$or": [
                    {"wallet.pro_messages_balance": {"$gte": cost}},
                    {"wallet.topup_messages_balance": {"$gte": cost}}
                ]
            },
            # Pipeline update: descuenta del plan primero, luego top-up
            [{"$set": {...}}],  # ver implementación
            return_document=ReturnDocument.AFTER
        )

        if result is None:
            raise InsufficientCreditsError()

        # Log de transacción
        credit_transactions.insert_one({...})

        return ChargeContext(tx_id, user_id, cost, source)

    def adjust_after_completion(self, ctx, tokens_in, tokens_out, cost_usd_actual):
        """
        Tras inferencia exitosa: si tokens_total > 4000, cobra 1 mensaje extra.
        Actualiza la transacción con tokens reales y coste real.
        """
        tokens_total = tokens_in + tokens_out
        if tokens_total > 4000 and ctx.counted_as == 1:
            self._charge_extra(ctx.user_id, 1)  # cobra 1 mensaje adicional

        credit_transactions.update_one(
            {"_id": ctx.tx_id},
            {"$set": {"tokens_in": ..., "tokens_out": ..., "cost_usd_actual": ...}}
        )

    def refund(self, ctx, reason="inference_failed"):
        """
        Si la inferencia falla con error 5xx, devuelve el mensaje al usuario.
        """
        users.update_one(
            {"_id": ctx.user_id},
            {"$inc": {f"wallet.{ctx.source}_messages_balance": ctx.cost}}
        )
        credit_transactions.insert_one({
            "delta": +ctx.cost,
            "reason": "refund",
            "ref_tx_id": ctx.tx_id,
            ...
        })
```

**Reglas de oro:**
1. **Atomicidad**: el chequeo y la deducción suceden en una sola operación de Mongo. NUNCA hacer `find` + `update` separados (race condition garantizada).
2. **Refund automático en error 5xx**: si la inferencia falla por error del modelo o timeout, devolver el mensaje. Si falla por error del usuario (validación, etc.), no devolver.
3. **Logging exhaustivo**: cada deducción y cada refund genera entrada en `credit_transactions`.
4. **Coste real vs estimado**: loggear `cost_usd_actual` (calculado desde tokens reales × precio DeepSeek) para detectar erosión de margen.

#### C. Inyección en el Orchestrator

`backend/app/application/orchestrator.py` recibe el `credit_manager` por DI. Flujo por mensaje:

```
1. orchestrator.process_message(user_id, content):
2.   ctx = credit_manager.reserve_and_charge(user_id, agent_id, model)
3.   try:
4.       response = deepseek_client.invoke(...)
5.       credit_manager.adjust_after_completion(ctx, tokens_in, tokens_out, cost_actual)
6.       return response
7.   except DeepSeekServerError:
8.       credit_manager.refund(ctx, reason="inference_failed")
9.       raise
```

#### D. Rate limiting

**Independiente del crédito.** Aunque el usuario tenga mensajes, no debe poder spammear:
- Free: 10 req/min por user_id.
- Starter: 30 req/min.
- Premium: 60 req/min (excepto API key, ver abajo).
- API (Premium): 60 req/min por API key, máx 10.000 calls/mes incluidas. Por encima → 1 mensaje/call adicional.

Implementación: middleware basado en Redis con sliding window.

#### E. Caps de recursos

- **RAG storage**: validar antes de cada upload. Si excede el cap del plan → error 413.
- **Custom agents**: validar en `POST /agents/create`. Si excede el cap → error 403.
- **API access**: middleware que verifica `plan_id == "premium"` antes de aceptar API keys.

### 2.3 Frontend (React / Vite)

Ubicación: `frontend/src/features/billing/`.

#### A. Estado global (Zustand)

`useBillingStore`:
```typescript
{
  plan_id: 'free' | 'starter' | 'premium',
  pro_messages_balance: number,
  topup_messages_balance: number,
  current_period_end: string,
  rag_storage_used_mb: number,
  custom_agents_count: number,

  // Acciones
  refresh(): Promise<void>,
  openPaywall(reason: '402' | 'upgrade_cta' | 'rag_full' | 'agents_full'): void,
  closePaywall(): void,
  paywall: { open: boolean, reason: string | null },
}
```

#### B. UI

- **Indicador de mensajes**: top-right del chat o sidebar. "⚡ 1.400 / 1.000 + 700 top-up". Click → abre página de billing.
- **Página `/pricing`**: lista los 3 planes + comparativa de features. CTAs llaman a `POST /billing/checkout`.
- **Página `/billing`**: estado actual, próxima renovación, botón "Gestionar suscripción" → Customer Portal de Stripe. Compra de top-ups (solo si plan pago).
- **Paywall modal**: se abre con `useBillingStore.openPaywall(reason)`. Muestra mensaje contextual:
  - `'402'`: "Has agotado tus mensajes este mes. Sube de plan o compra un top-up."
  - `'rag_full'`: "Has alcanzado el límite de RAG de tu plan. Sube a Premium para 1 GB."
  - `'agents_full'`: "Tu plan permite máx. 3 agentes custom. Sube a Premium para ilimitados."

#### C. Manejo de errores 402 (Axios interceptor)

```typescript
// shared/api.ts
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 402) {
      // Llamada directa al store, sin eventBus
      useBillingStore.getState().openPaywall('402');
    }
    return Promise.reject(error);
  }
);
```

**Nota:** evitar `eventBus` global. Llamar directamente al store es más limpio y desacoplado.

#### D. Refresh del balance

Tras cada respuesta de inferencia exitosa, refrescar el balance localmente con un decremento optimista. Resync completo:
- Al cargar la app.
- Tras cualquier 402.
- Tras cerrar la pestaña de billing.
- Cada 5 minutos en background si la pestaña está activa.

---

## 3. ANTI-ABUSE Y SEGURIDAD

### 3.1 Free tier abuse
- **Verificación de email obligatoria** antes de otorgar los 5 mensajes Pro/mes (Firebase Auth — ya implementado).
- Considerar device fingerprinting en v2 si vemos abusos masivos.

### 3.2 API reventa
- TOS prohíbe explícitamente la reventa.
- Rate limit por API key.
- Cobro por consumo sobre umbral (10k calls/mes incluidas en Premium).

### 3.3 Webhooks
- Verificación de firma `Stripe-Signature` siempre.
- Idempotencia con `stripe_events_processed`.
- Endpoint público pero rate-limited a nivel de infraestructura.

### 3.4 Race conditions
- Toda operación sobre `wallet.*` debe ser atómica (`findOneAndUpdate` con condición `$gte`).
- Tests E2E que simulen 50 requests concurrentes con balance limitado.

---

## 4. OBSERVABILIDAD Y MÉTRICAS

### 4.1 Métricas críticas a trackear desde día 1

- **MRR** (Monthly Recurring Revenue) por plan.
- **Churn rate** mensual por plan.
- **Cost per user** (suma de `cost_usd_actual` por user_id en el periodo).
- **Gross margin real** = (revenue neto − coste API real) / revenue neto.
- **Distribución de uso** por plan: % que agotan cuota, % que compran top-ups.
- **Conversión** Free → Starter, Starter → Premium.
- **Distribución de tokens por mensaje**: detectar si el cap de 4k se está activando demasiado o demasiado poco.

### 4.2 Alertas

- Margen real <40% en cualquier plan durante una semana → alerta.
- Webhooks fallidos (no 2xx) → alerta inmediata.
- `credit_transactions` sin contraparte en `stripe_events_processed` para reasons financieros → alerta.

---

## 5. PASOS DE EJECUCIÓN (Roadmap)

### Semana 0 — Diseño (3-4 días)
- ✅ Decisiones de negocio cerradas (este documento).
- Crear migración del schema de `users` (añadir `wallet`, `limits`, ampliar `subscription`).
- Crear colecciones `credit_transactions` y `stripe_events_processed` con índices.
- Cuenta Stripe Test + activar Stripe Tax.
- Definir contrato exacto de `CreditManager` (interfaz + errores + tests unitarios).

### Semana 1 — Backend core
- Implementar `CreditManager` con débito atómico + log a `credit_transactions`.
- Endpoint `GET /users/me/billing`.
- Integrar `CreditManager` en orchestrator.
- Lógica del cap de 4k tokens.
- Rate limiting por user/plan.
- Caps de RAG storage y custom agents.
- **Tests E2E de race conditions** (50 requests concurrentes con balance limitado — crítico).

### Semana 2 — Stripe
- Endpoint `POST /billing/checkout` (Checkout Sessions).
- Endpoint `POST /billing/portal`.
- Webhook `/webhooks/stripe` con verificación de firma + idempotencia.
- Manejo de los 5 eventos críticos (checkout, sub.updated, sub.deleted, payment.failed, payment.succeeded).
- Tests con eventos simulados de Stripe CLI.

### Semana 3 — Frontend + paywall
- `useBillingStore` (Zustand).
- Indicador de mensajes en UI.
- Página `/pricing`.
- Página `/billing` con Customer Portal.
- Paywall modal (3 razones: 402, rag_full, agents_full).
- Interceptor 402 en Axios.
- Decremento optimista + resync periódico.

### Semana 4 — Hardening y lanzamiento
- Panel admin mínimo (ver balance de un user, reembolsar manualmente, ver historial de `credit_transactions`).
- Dashboard de métricas (MRR, churn, gross margin, conversión).
- TOS y política de privacidad actualizados (reembolsos UE, prohibición de reventa).
- Checkbox de consentimiento explícito en checkout (consumo inmediato del servicio digital).
- Pruebas E2E completas:
  - Flujo de compra exitoso.
  - Flujo de pago fallido.
  - Cancelación + acceso hasta `period_end`.
  - Downgrade y upgrade mid-cycle.
  - Reset al renovar.
  - Top-up purchase y consumo.
  - 402 en chat → paywall → upgrade → continuación.

---

## 6. APÉNDICE: TABLA RESUMEN DE FEATURES

| Feature | Free | Starter (€9.99) | Premium (€19.99) |
|---|---|---|---|
| Mensajes Pro/mes | 5 | 1.000 | 2.000 |
| Modelo | DeepSeek V4 Pro | DeepSeek V4 Pro | DeepSeek V4 Pro |
| Cap tokens/mensaje | 4.000 (extra cuenta 2) | 4.000 (extra cuenta 2) | 4.000 (extra cuenta 2) |
| RAG storage | 20 MB | 100 MB | 1 GB |
| Agentes preset | ✅ | ✅ | ✅ |
| Crear agentes custom | ❌ | 3 max | ilimitados |
| API access | ❌ | ❌ | ✅ (10k calls/mes incluidas) |
| Soporte | comunidad | email | prioritario |
| Top-ups disponibles | 100 msg / €4.99 | 700 msg / €5.99 | 1k/€7.99, 2k/€14.99, 10k/€74.99 |
| Carry-over de mensajes | n/a | NO (reset al renovar) | NO (reset al renovar) |
| Carry-over de top-ups | sí, mientras cuenta activa | sí, siempre | sí, siempre |
| Rate limit | 10 req/min | 30 req/min | 60 req/min |

---

## 7. REGISTRO DE DECISIONES (CHANGELOG)

- **2026-05-10**: documento inicial con sistema dinámico de puntos (DeepSeek V4 Flash + Pro).
- **2026-05-10**: pivote a sistema de mensajes fijos solo Pro. Eliminado Flash del producto. Decididos tiers definitivos: Free 5/mes, Starter €9.99/1.000, Premium €19.99/2.000. Top-ups con descuento por volumen ajustado a margen real. Añadido cap de tokens 4.000 = 1 mensaje. Cerradas políticas de carry-over, cancelación, reembolsos y reventa de API. Añadidas correcciones técnicas críticas: atomicidad del débito, `credit_transactions` auditable, idempotencia de webhooks, Stripe Checkout Sessions, Stripe Tax para IVA, rate limiting independiente.
- **2026-05-10**: añadido top-up Free (100 mensajes / €4.99, margen 91%). No caduca mientras la cuenta exista. No desbloquea features de planes pagos. Captura al usuario casual sin suscripción. Precio por mensaje 5× más caro que Starter para preservar upgrade path. Refinada política de carry-over de top-ups: una vez comprados, persisten mientras la cuenta esté activa, incluso tras cancelación de plan pago.
