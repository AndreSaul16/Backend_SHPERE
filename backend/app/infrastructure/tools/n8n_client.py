"""
Cliente HTTP asíncrono para llamar webhooks de n8n.
Autenticación HMAC-SHA256, retry con exponential backoff, circuit breaker.
"""

import hashlib
import hmac
import json
import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from app.core.logger import checkpoint_logger as logger


def canonical_sign(payload: dict, secret: str) -> str:
    """Firma HMAC-SHA256 sobre la forma canónica del payload.

    Forma canónica = JSON con claves ordenadas, sin espacios, UTF-8 sin escapar.
    Los workflows de n8n no tienen acceso al raw body (reciben el JSON ya parseado),
    así que ambos lados firman/verifican la misma serialización reconstruible desde
    el objeto. Reutilizada por el cliente (envío) y por el webhook n8n→backend
    (verificación, F9) para que la firma sea idéntica en ambos sentidos.
    """
    canonical = json.dumps(
        payload, separators=(",", ":"), sort_keys=True, ensure_ascii=False
    ).encode("utf-8")
    return hmac.new(secret.encode(), canonical, hashlib.sha256).hexdigest()


class N8NClient:
    """Cliente singleton para comunicarse con n8n via webhooks."""

    def __init__(self, base_url: str, webhook_secret: str):
        self.base_url = base_url.rstrip("/")
        self.webhook_secret = webhook_secret
        self._client: httpx.AsyncClient | None = None
        self._circuit_breaker = None  # Lazy init

    async def start(self):
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(30.0, connect=5.0),
        )
        logger.info(f"N8NClient iniciado -> {self.base_url}")

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None
            logger.info("N8NClient cerrado")

    async def _get_circuit_breaker(self):
        """Lazy init del circuit breaker."""
        if self._circuit_breaker is None:
            from app.core.circuit_breaker import CircuitBreaker

            self._circuit_breaker = CircuitBreaker(
                name="n8n",
                failure_threshold=5,
                recovery_timeout=30,
            )
        return self._circuit_breaker

    def _sign(self, payload: dict) -> str:
        """Firma HMAC-SHA256 sobre la forma canónica del payload. Ver canonical_sign."""
        return canonical_sign(payload, self.webhook_secret)

    async def call_webhook(
        self,
        webhook_path: str,
        payload: dict,
        timeout: float = 30.0,
        user_credentials: dict = None,
    ) -> dict:
        """
        POST a un webhook de n8n con retry + circuit breaker.

        - 3 reintentos con backoff exponencial (1s, 2s, 4s)
        - Solo reintenta en 5xx o timeouts de red
        - Circuit breaker: tras 5 fallos consecutivos, abre por 30s
        """
        if not self._client:
            return {
                "error": True,
                "service": "n8n",
                "message": "N8NClient no inicializado.",
            }

        # Verificar circuit breaker
        cb = await self._get_circuit_breaker()
        if not await cb.can_execute():
            return {
                "error": True,
                "service": "n8n",
                "message": "Servicio n8n no disponible (circuit breaker abierto). Intenta de nuevo en 30s.",
            }

        try:
            result = await self._call_with_retry(
                webhook_path, payload, timeout, user_credentials
            )
            # Verificar si el resultado indica error
            if isinstance(result, dict) and result.get("error"):
                await cb.record_failure()
            else:
                await cb.record_success()
            return result

        except Exception as e:
            await cb.record_failure()
            logger.error(
                f"Error en call_webhook ({webhook_path}): {type(e).__name__}: {e}"
            )
            # Retornar error en vez de raise — las tools deben ser resilientes.
            # El hint lo lee el USUARIO en el chat (card de tool_error), no un
            # operador: darle una acción útil, no "revisa el contenedor".
            return {
                "error": True,
                "service": "n8n",
                "message": f"Servicio de automatizaciones no disponible: {type(e).__name__}",
                "hint": (
                    "El servicio externo de automatizaciones no responde ahora mismo. "
                    "Inténtalo de nuevo en unos minutos; si persiste, revisa el estado "
                    "de tus conexiones en Settings → Connections."
                ),
            }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=4),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectError)),
        reraise=True,
    )
    async def _call_with_retry(
        self,
        webhook_path: str,
        payload: dict,
        timeout: float,
        user_credentials: dict = None,
    ) -> dict:
        """Llamada HTTP con retry automático."""
        url = f"/webhook/{webhook_path}"

        # Inject user credentials into payload if provided
        if user_credentials:
            payload = {**payload, "user_credentials": user_credentials}

        body = json.dumps(payload).encode()
        signature = self._sign(payload)

        try:
            response = await self._client.post(
                url,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Webhook-Signature": signature,
                },
                timeout=timeout,
            )
            response.raise_for_status()
            try:
                return response.json()
            except json.JSONDecodeError:
                logger.error(
                    f"n8n responded with non-JSON body (status {response.status_code}): "
                    f"{response.text[:300]}"
                )
                return {
                    "error": True,
                    "service": "n8n",
                    "message": "n8n returned non-JSON response",
                    "details": response.text[:500],
                }

        except httpx.TimeoutException:
            logger.error(f"Timeout llamando n8n webhook: {url}")
            raise

        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            logger.error(f"Error HTTP de n8n: {status} - {url}")
            # No reintentar en 4xx (error del cliente)
            if status < 500:
                return {"error": True, "message": f"Error n8n: {status}"}
            # Reintentar en 5xx
            raise

        except httpx.ConnectError:
            logger.error(f"No se pudo conectar a n8n: {url}")
            raise


# Instancia global — main.py la setea en el lifespan vía set_client().
_client: N8NClient | None = None


def set_client(client: N8NClient | None) -> None:
    """Registra la instancia real (llamado desde el lifespan de main.py)."""
    global _client
    _client = client


class _N8NClientProxy:
    """Resuelve la instancia real en tiempo de LLAMADA, no de import.

    Las tools hacen `from ...n8n_client import n8n_client` a nivel de módulo;
    con una variable plana capturarían None si algo las importara antes del
    lifespan (p. ej. un test). El proxy elimina esa dependencia del orden.
    """

    def __getattr__(self, name):
        if _client is None:
            raise RuntimeError(
                "n8n_client no inicializado: el lifespan de main.py aún no llamó "
                "a set_client() (¿import fuera de la app, o test sin fixture?)"
            )
        return getattr(_client, name)


n8n_client = _N8NClientProxy()
