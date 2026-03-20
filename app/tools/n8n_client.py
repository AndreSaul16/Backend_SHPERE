"""
Cliente HTTP asíncrono para llamar webhooks de n8n.
Autenticación HMAC-SHA256, manejo de errores y timeouts.
"""
import hashlib
import hmac
import json
import httpx
from app.core.logger import checkpoint_logger as logger


class N8NClient:
    """Cliente singleton para comunicarse con n8n via webhooks."""

    def __init__(self, base_url: str, webhook_secret: str):
        self.base_url = base_url.rstrip("/")
        self.webhook_secret = webhook_secret
        self._client: httpx.AsyncClient | None = None

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

    def _sign(self, body: bytes) -> str:
        return hmac.new(
            self.webhook_secret.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()

    async def call_webhook(
        self,
        webhook_path: str,
        payload: dict,
        timeout: float = 30.0,
    ) -> dict:
        """
        POST a un webhook de n8n y retorna la respuesta JSON.

        Args:
            webhook_path: Ruta del webhook (e.g. "shared/calendar-list")
            payload: Datos a enviar como JSON body
            timeout: Timeout en segundos para esta llamada específica
        """
        if not self._client:
            raise RuntimeError("N8NClient no inicializado. Llama start() primero.")

        url = f"/webhook/{webhook_path}"
        body = json.dumps(payload).encode()
        signature = self._sign(body)

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
            return response.json()

        except httpx.TimeoutException:
            logger.error(f"Timeout llamando n8n webhook: {url}")
            return {"error": True, "message": f"El servicio n8n no respondió a tiempo ({timeout}s)"}

        except httpx.HTTPStatusError as e:
            logger.error(f"Error HTTP de n8n: {e.response.status_code} - {url}")
            return {"error": True, "message": f"Error n8n: {e.response.status_code}"}

        except httpx.ConnectError:
            logger.error(f"No se pudo conectar a n8n: {url}")
            return {"error": True, "message": "No se pudo conectar al servicio n8n. Verifica que esté corriendo."}


# Instancia global — se inicializa en main.py lifespan
n8n_client: N8NClient | None = None
