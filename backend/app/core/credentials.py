"""
Servicio de credenciales OAuth multi-tenant.
Cifra tokens con Fernet antes de guardarlos en MongoDB.
Maneja fetch, store, refresh y revoke de tokens por usuario y provider.
"""

import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional

from cryptography.fernet import Fernet, MultiFernet, InvalidToken
from app.core.config import settings
from app.infrastructure.database import get_oauth_credentials_collection
from app.core.logger import api_logger as logger


def _key_version(key: str) -> str:
    """Huella corta y estable de una clave Fernet (no reversible).
    Permite saber con qué clave se cifró un documento sin exponer la clave,
    para futuras migraciones de re-cifrado tras una rotación."""
    return hashlib.sha256(key.encode()).hexdigest()[:8]


class CredentialsService:
    """
    Broker de credenciales: el backend es la única fuente de verdad.
    Los tokens se cifran con Fernet antes de escribir a MongoDB.

    Rotación de claves (A35): usa MultiFernet con la lista FERNET_KEYS.
    Cifra siempre con la PRIMERA clave; descifra probando todas. Para rotar,
    se antepone la clave nueva y se conserva la vieja hasta re-cifrar los datos.
    """

    def __init__(self):
        keys = settings.fernet_keys_list
        if not keys:
            logger.warning(
                "FERNET_KEY/FERNET_KEYS no configurado. "
                "Las credenciales NO estarán cifradas (modo desarrollo)."
            )
            self._fernet = None
            self._key_version = "plain"
        else:
            self._fernet = MultiFernet([Fernet(k.encode()) for k in keys])
            # La versión activa es la de la PRIMERA clave (la que cifra).
            self._key_version = _key_version(keys[0])

    @property
    def key_version(self) -> str:
        """Versión de la clave activa (la que se usa para cifrar nuevos datos)."""
        return self._key_version

    def _encrypt(self, token: str) -> bytes:
        """Cifra un token con la clave Fernet activa."""
        if not self._fernet:
            return token.encode()  # Sin cifrado en modo dev
        return self._fernet.encrypt(token.encode())

    def _decrypt(self, encrypted: bytes) -> str:
        """Descifra un token probando todas las claves configuradas."""
        if not self._fernet:
            return encrypted.decode()  # Sin descifrado en modo dev
        try:
            return self._fernet.decrypt(encrypted).decode()
        except InvalidToken:
            logger.error(
                "Token Fernet inválido — la clave que lo cifró no está en "
                "FERNET_KEYS. Si acabas de rotar, conserva la clave anterior."
            )
            raise ValueError("No se pudo descifrar la credencial")

    async def get_token(self, user_id: str, provider: str) -> Optional[str]:
        """
        Obtiene el access token de un usuario para un provider.
        Refresca automáticamente si está cerca de expirar.
        """
        col = get_oauth_credentials_collection()
        cred = await col.find_one({"user_id": user_id, "provider": provider})

        if not cred:
            return None

        if cred.get("revoked_at"):
            logger.debug(f"Credencial {provider} revocada para user {user_id}")
            return None

        # Auto-refresh si falta <5 min para expirar
        expires_at = cred.get("expires_at")
        if expires_at and expires_at < datetime.now(timezone.utc) + timedelta(
            minutes=5
        ):
            logger.info(f"Token {provider} expirando pronto, intentando refresh...")
            refreshed = await self._refresh_token(user_id, provider, cred)
            if refreshed:
                return refreshed
            # Si el refresh falla, devolver el token actual (quizás aún sirva)

        return self._decrypt(cred["access_token_enc"])

    async def store_token(
        self,
        user_id: str,
        provider: str,
        access_token: str,
        refresh_token: Optional[str] = None,
        scopes: Optional[list[str]] = None,
        expires_in: Optional[int] = None,
    ):
        """
        Cifra y almacena tokens OAuth para un usuario y provider.
        Upsert: sobreescribe si ya existe.
        """
        col = get_oauth_credentials_collection()
        now = datetime.now(timezone.utc)

        expires_at = None
        if expires_in:
            expires_at = now + timedelta(seconds=expires_in)

        doc = {
            "user_id": user_id,
            "provider": provider,
            "access_token_enc": self._encrypt(access_token),
            "refresh_token_enc": self._encrypt(refresh_token)
            if refresh_token
            else None,
            "scopes": scopes or [],
            "expires_at": expires_at,
            "connected_at": now,
            "revoked_at": None,
            "key_version": self._key_version,
        }

        await col.update_one(
            {"user_id": user_id, "provider": provider},
            {"$set": doc},
            upsert=True,
        )

        # Actualizar connected_providers en el user
        from app.infrastructure.database import get_users_collection

        users_col = get_users_collection()
        await users_col.update_one(
            {"firebase_uid": user_id},
            {"$addToSet": {"connected_providers": provider}},
        )

        logger.info(f"Token {provider} almacenado para user {user_id}")

    async def revoke(self, user_id: str, provider: str):
        """Revoca una credencial (soft-delete)."""
        col = get_oauth_credentials_collection()
        result = await col.update_one(
            {"user_id": user_id, "provider": provider},
            {"$set": {"revoked_at": datetime.now(timezone.utc)}},
        )

        if result.modified_count > 0:
            # Remover de connected_providers
            from app.infrastructure.database import get_users_collection

            users_col = get_users_collection()
            await users_col.update_one(
                {"firebase_uid": user_id},
                {"$pull": {"connected_providers": provider}},
            )
            logger.info(f"Credencial {provider} revocada para user {user_id}")

        return result.modified_count > 0

    async def is_connected(self, user_id: str, provider: str) -> bool:
        """Verifica si un usuario tiene un provider conectado y activo."""
        col = get_oauth_credentials_collection()
        cred = await col.find_one(
            {
                "user_id": user_id,
                "provider": provider,
                "revoked_at": None,
            }
        )
        return cred is not None

    async def list_connected(self, user_id: str) -> list[dict]:
        """Lista los providers conectados del usuario (sin exponer tokens)."""
        col = get_oauth_credentials_collection()
        result = []
        async for cred in col.find({"user_id": user_id, "revoked_at": None}):
            result.append(
                {
                    "provider": cred["provider"],
                    "scopes": cred.get("scopes", []),
                    "connected_at": cred.get("connected_at"),
                    "expires_at": cred.get("expires_at"),
                    "revoked": False,
                }
            )
        return result

    async def _refresh_token(
        self, user_id: str, provider: str, cred: dict
    ) -> Optional[str]:
        """
        Intenta refrescar un token expirado.
        Llama al endpoint de refresh del provider.
        """
        import httpx

        refresh_token_enc = cred.get("refresh_token_enc")
        if not refresh_token_enc:
            logger.warning(f"No hay refresh_token para {provider} de user {user_id}")
            return None

        refresh_token = self._decrypt(refresh_token_enc)

        try:
            if provider == "github":
                # GitHub tokens de OAuth App no expiran, solo los de GitHub App
                return self._decrypt(cred["access_token_enc"])

            # Usar las creds de la OAuth app del propio usuario (BYO); para Google,
            # si no hay BYO, caer a la app compartida de SPHERE (env).
            app = await self.get_oauth_app(user_id, provider)
            if not app and provider == "google":
                from app.core.config import settings as _settings

                if _settings.GOOGLE_OAUTH_CLIENT_ID and _settings.GOOGLE_OAUTH_CLIENT_SECRET:
                    app = {
                        "client_id": _settings.GOOGLE_OAUTH_CLIENT_ID,
                        "client_secret": _settings.GOOGLE_OAUTH_CLIENT_SECRET,
                    }
            if not app:
                logger.warning(
                    f"No hay OAuth app de {provider} registrada para user {user_id}; "
                    "no se puede refrescar el token."
                )
                return None

            if provider == "notion":
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        "https://api.notion.com/v1/oauth/token",
                        data={
                            "grant_type": "refresh_token",
                            "refresh_token": refresh_token,
                        },
                        auth=(app["client_id"], app["client_secret"]),
                    )
                    resp.raise_for_status()
                    data = resp.json()

                    await self.store_token(
                        user_id,
                        provider,
                        access_token=data["access_token"],
                        refresh_token=data.get("refresh_token"),
                        expires_in=data.get("expires_in"),
                    )
                    return data["access_token"]

            elif provider == "slack":
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        "https://slack.com/api/oauth.v2.access",
                        data={
                            "grant_type": "refresh_token",
                            "refresh_token": refresh_token,
                            "client_id": app["client_id"],
                            "client_secret": app["client_secret"],
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()

                    if data.get("ok"):
                        await self.store_token(
                            user_id,
                            provider,
                            access_token=data["access_token"],
                            refresh_token=data.get("refresh_token"),
                            expires_in=data.get("expires_in"),
                        )
                        return data["access_token"]

            elif provider == "google":
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        "https://oauth2.googleapis.com/token",
                        data={
                            "grant_type": "refresh_token",
                            "refresh_token": refresh_token,
                            "client_id": app["client_id"],
                            "client_secret": app["client_secret"],
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    if data.get("access_token"):
                        # Google no reemite refresh_token en el refresh: conservamos el actual.
                        await self.store_token(
                            user_id,
                            provider,
                            access_token=data["access_token"],
                            refresh_token=refresh_token,
                            expires_in=data.get("expires_in"),
                        )
                        return data["access_token"]

        except Exception as e:
            logger.error(f"Error refrescando token {provider}: {e}")
            return None

    # ============================================================
    # SERVICE CREDENTIALS (API Keys for external services)
    # ============================================================

    async def store_service_credential(
        self,
        user_id: str,
        service: str,
        api_key: str,
        credential_type: str = "api_key",
        metadata: dict = None,
    ):
        """
        Cifra y almacena una credencial de servicio para un usuario.
        Upsert: sobreescribe si ya existe.
        """
        from app.infrastructure.database import get_service_credentials_collection
        from datetime import datetime, timezone

        col = get_service_credentials_collection()
        now = datetime.now(timezone.utc)

        doc = {
            "user_id": user_id,
            "service": service,
            "credential_type": credential_type,
            "key_enc": self._encrypt(api_key),
            "metadata": metadata or {},
            "updated_at": now,
            "revoked_at": None,
            "key_version": self._key_version,
        }

        await col.update_one(
            {"user_id": user_id, "service": service},
            {
                "$set": doc,
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )

        logger.info(f"Service credential '{service}' almacenada para user {user_id}")

    async def get_service_credential(self, user_id: str, service: str) -> Optional[str]:
        """
        Obtiene y descifra la credencial de un servicio para un usuario.
        Retorna None si no existe o está revocada.
        """
        from app.infrastructure.database import get_service_credentials_collection

        col = get_service_credentials_collection()
        cred = await col.find_one(
            {
                "user_id": user_id,
                "service": service,
                "revoked_at": None,
            }
        )

        if not cred:
            return None

        return self._decrypt(cred["key_enc"])

    async def get_service_credential_with_metadata(
        self, user_id: str, service: str
    ) -> Optional[dict]:
        """
        Obtiene la credencial con metadata para un servicio.
        Retorna dict con 'key' (descifrada) y 'metadata', o None.
        """
        from app.infrastructure.database import get_service_credentials_collection

        col = get_service_credentials_collection()
        cred = await col.find_one(
            {
                "user_id": user_id,
                "service": service,
                "revoked_at": None,
            }
        )

        if not cred:
            return None

        return {
            "key": self._decrypt(cred["key_enc"]),
            "metadata": cred.get("metadata", {}),
        }

    async def list_service_credentials(self, user_id: str) -> list[dict]:
        """
        Lista las credenciales de servicios del usuario (sin exponer keys).
        """
        from app.infrastructure.database import get_service_credentials_collection

        col = get_service_credentials_collection()
        result = []
        async for cred in col.find({"user_id": user_id, "revoked_at": None}):
            result.append(
                {
                    "id": cred.get("id", str(cred["_id"])),
                    "service": cred["service"],
                    "credential_type": cred.get("credential_type", "api_key"),
                    "metadata": cred.get("metadata", {}),
                    "created_at": cred.get("created_at"),
                    "updated_at": cred.get("updated_at"),
                    "connected": True,
                }
            )
        return result

    async def revoke_service_credential(self, user_id: str, service: str) -> bool:
        """
        Revoca una credencial de servicio (soft-delete).
        """
        from app.infrastructure.database import get_service_credentials_collection
        from datetime import datetime, timezone

        col = get_service_credentials_collection()
        result = await col.update_one(
            {"user_id": user_id, "service": service},
            {"$set": {"revoked_at": datetime.now(timezone.utc)}},
        )

        if result.modified_count > 0:
            logger.info(f"Service credential '{service}' revocada para user {user_id}")
            return True
        return False

    # ============================================================
    # USER OAUTH APPS (BYO — cada usuario su propia OAuth app)
    # ============================================================

    async def store_oauth_app(
        self,
        user_id: str,
        provider: str,
        client_id: str,
        client_secret: str,
        scopes: Optional[list[str]] = None,
    ):
        """
        Cifra y almacena la OAuth app (client_id + client_secret) de un usuario.
        El client_secret se cifra con Fernet; el client_id se guarda en claro
        (no es secreto). Upsert: sobreescribe si ya existe.
        """
        from app.infrastructure.database import get_user_oauth_apps_collection

        col = get_user_oauth_apps_collection()
        now = datetime.now(timezone.utc)

        doc = {
            "user_id": user_id,
            "provider": provider,
            "client_id": client_id,
            "client_secret_enc": self._encrypt(client_secret),
            "scopes": scopes or [],
            "updated_at": now,
            "revoked_at": None,
            "key_version": self._key_version,
        }

        await col.update_one(
            {"user_id": user_id, "provider": provider},
            {"$set": doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )

        # NUNCA loguear el client_secret.
        logger.info(f"OAuth app '{provider}' almacenada para user {user_id}")

    async def get_oauth_app(self, user_id: str, provider: str) -> Optional[dict]:
        """
        Obtiene la OAuth app de un usuario (client_id + client_secret descifrado).
        Retorna None si no existe o está revocada.
        """
        from app.infrastructure.database import get_user_oauth_apps_collection

        col = get_user_oauth_apps_collection()
        app = await col.find_one(
            {"user_id": user_id, "provider": provider, "revoked_at": None}
        )
        if not app:
            return None

        return {
            "client_id": app["client_id"],
            "client_secret": self._decrypt(app["client_secret_enc"]),
            "scopes": app.get("scopes", []),
        }

    async def list_oauth_apps(self, user_id: str) -> list[dict]:
        """Lista las OAuth apps registradas del usuario (sin exponer el secret)."""
        from app.infrastructure.database import get_user_oauth_apps_collection

        col = get_user_oauth_apps_collection()
        result = []
        async for app in col.find({"user_id": user_id, "revoked_at": None}):
            result.append(
                {
                    "provider": app["provider"],
                    "client_id": app["client_id"],
                    "scopes": app.get("scopes", []),
                    "created_at": app.get("created_at"),
                    "updated_at": app.get("updated_at"),
                    "connected": True,
                }
            )
        return result

    async def revoke_oauth_app(self, user_id: str, provider: str) -> bool:
        """
        Revoca (soft-delete) la OAuth app de un usuario Y revoca los tokens OAuth
        asociados (las credenciales emitidas por esa app dejan de tener sentido).
        """
        from app.infrastructure.database import get_user_oauth_apps_collection

        col = get_user_oauth_apps_collection()
        result = await col.update_one(
            {"user_id": user_id, "provider": provider, "revoked_at": None},
            {"$set": {"revoked_at": datetime.now(timezone.utc)}},
        )

        if result.modified_count > 0:
            # Revocar también los tokens emitidos con esta app.
            await self.revoke(user_id, provider)
            logger.info(f"OAuth app '{provider}' revocada para user {user_id}")
            return True
        return False

    async def load_credentials_for_n8n(self, user_id: str, services: list[str]) -> dict:
        """
        Carga credenciales de múltiples servicios para inyectar en payloads de n8n.
        Retorna dict: {"google_calendar": {"api_key": "...", ...}, ...}

        El secreto se expone bajo AMBAS claves — `api_key` y `access_token` —
        porque los workflows n8n no son homogéneos: google-calendar/jules/cfo
        leen `creds.api_key`, mientras whatsapp/linkedin/instagram leen
        `creds.access_token`. Emitir solo una rompía el otro grupo. El metadata
        del usuario (phone_number_id, calendar_id, ...) puede sobreescribirlas.

        Caso especial google_calendar: Google Calendar API necesita un access_token
        OAuth2 (no una api_key). Si el usuario conectó Google vía OAuth, usamos su
        token (auto-refrescado). Si no hay OAuth, caemos al service-credential (compat).
        """
        result = {}
        for service in services:
            if service == "google_calendar":
                token = await self.get_token(user_id, "google")
                if token:
                    # Conservar calendar_id del service-credential si existe.
                    sc = await self.get_service_credential_with_metadata(user_id, service)
                    metadata = (sc or {}).get("metadata", {}) if sc else {}
                    result[service] = {"api_key": token, "access_token": token, **metadata}
                    continue
            cred = await self.get_service_credential_with_metadata(user_id, service)
            if cred:
                result[service] = {
                    "api_key": cred["key"],
                    "access_token": cred["key"],
                    **cred["metadata"],
                }
        return result


# Instancia global
credentials_service = CredentialsService()
