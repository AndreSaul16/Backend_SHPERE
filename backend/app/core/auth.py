"""
Firebase Auth middleware + auto-provisioning de usuarios.
Verifica ID tokens de Firebase y crea el documento User si no existe.
"""

import json
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.config import settings
from app.infrastructure.database import get_users_collection
from app.core.logger import api_logger as logger

security = HTTPBearer(auto_error=False)

_firebase_initialized = False


def init_firebase():
    """Inicializa Firebase Admin SDK. Llamar en lifespan de FastAPI."""
    global _firebase_initialized
    if _firebase_initialized:
        return

    # Railway-friendly: aceptar JSON como variable de entorno
    if settings.FIREBASE_CREDENTIALS_JSON:
        try:
            cred_dict = json.loads(settings.FIREBASE_CREDENTIALS_JSON)
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
            _firebase_initialized = True
            logger.info("Firebase Admin SDK inicializado desde FIREBASE_CREDENTIALS_JSON")
            return
        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"FIREBASE_CREDENTIALS_JSON inválido: {e}")
            raise
    elif settings.FIREBASE_CREDENTIALS_PATH:
        try:
            cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
            firebase_admin.initialize_app(cred)
            _firebase_initialized = True
            logger.info("Firebase Admin SDK inicializado desde archivo")
            return
        except Exception as e:
            logger.error(f"Error inicializando Firebase desde archivo: {e}")
            raise

    logger.warning(
        "FIREBASE_CREDENTIALS_PATH/FIREBASE_CREDENTIALS_JSON no configurado. "
        "Auth estará deshabilitado (modo desarrollo)."
    )


async def _verify_token(token: str) -> dict:
    """
    Verifica un Firebase ID token y retorna los claims decodificados.

    Raises:
        HTTPException 401 si el token es inválido o expiró.
        HTTPException 503 si Firebase no está inicializado en producción.
    """
    if not _firebase_initialized:
        # En PROD, auth roto = 503. Nunca degradar silenciosamente a un usuario fake.
        if settings.is_production:
            logger.critical(
                "Firebase NO inicializado en PRODUCCIÓN. "
                "Rechazando todos los requests autenticados. "
                "Configura FIREBASE_CREDENTIALS_PATH."
            )
            raise HTTPException(
                status_code=503,
                detail="Servicio de autenticación no disponible",
            )
        # Dev explícito: aceptar un token especial "dev-token" mapeado a dev_user
        # Cualquier otro token en dev también se rechaza para evitar confusión
        if token == "dev-token":
            logger.warning("AUTH DEV MODE: aceptando 'dev-token' → dev_user")
            return {
                "uid": "dev_user",
                "email": "dev@sphere.local",
                "name": "Dev User",
            }
        raise HTTPException(
            status_code=401,
            detail=(
                "Firebase no configurado en desarrollo. "
                "Usa Authorization: Bearer dev-token para testing local."
            ),
        )

    try:
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except firebase_auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    except Exception as e:
        logger.error(f"Error verificando token: {e}")
        raise HTTPException(status_code=401, detail="Error de autenticación")


def _is_wallet_valid(wallet) -> bool:
    """Un wallet es válido si es un dict que contiene la clave pro_messages_balance."""
    return isinstance(wallet, dict) and "pro_messages_balance" in wallet


def _wallet_repair_set(current_wallet, new_wallet: dict) -> dict:
    """Construye el `$set` que repara el wallet según la FORMA del actual.

    Si el actual ya es un dict (aunque esté vacío o incompleto), se escribe con
    rutas con punto: Mongo fusiona, así que las claves ajenas a la reparación
    sobreviven (CS-002).

    Si es cualquier otra cosa —`null`, ausente, o un tipo corrupto— Mongo no
    puede crear subcampos dentro de ella y rechaza la escritura entera con
    WriteError code 28 («Cannot create field '...' in element {wallet: null}»),
    que en el login se traduce en un 500 para cualquier usuario legacy con el
    wallet nulo. Para esas formas se escribe el subdocumento `wallet` completo,
    que sí reemplaza el valor inválido.
    """
    if isinstance(current_wallet, dict):
        return {f"wallet.{key}": value for key, value in new_wallet.items()}
    return {"wallet": new_wallet}


async def _ensure_wallet(uid: str, user_doc: dict) -> dict:
    """Lazy wallet init: usuarios legacy creados sin campo wallet.
    Respeta email_verified: si no está verificado, balance=0.
    
    Wallet hardening (CS-001): wallets vacíos, nulos o sin pro_messages_balance
    se consideran inválidos y se re-inicializan. Un wallet válido debe ser
    un dict que contenga la clave pro_messages_balance.
    """
    wallet = user_doc.get("wallet")
    if _is_wallet_valid(wallet):
        return user_doc

    # Wallet inválido o ausente → log y re-inicializar
    if wallet is not None:
        logger.warning(
            f"Wallet inválido detectado para usuario {uid}: "
            f"tipo={type(wallet).__name__}, contiene={list(wallet.keys()) if isinstance(wallet, dict) else 'N/A'}. "
            f"Re-inicializando."
        )
    from datetime import datetime, timezone

    email_verified = user_doc.get("email_verified", True)
    pro_messages = settings.plan_messages_map["free"] if email_verified else 0

    users_col = get_users_collection()
    now = datetime.now(timezone.utc)
    new_wallet = {
        "pro_messages_balance": pro_messages,
        "pro_messages_granted_this_period": pro_messages,
        "last_period_reset": now,
        "topup_messages_balance": 0,
    }
    await users_col.update_one(
        {"firebase_uid": uid},
        {"$set": _wallet_repair_set(wallet, new_wallet)},
    )
    user_doc["wallet"] = new_wallet
    logger.info(f"Wallet inicializado (lazy) para usuario legacy: {uid}")
    return user_doc


async def _repair_wallet(uid: str, user_doc: dict) -> dict:
    """Repara wallets inválidos para usuarios existentes (CS-003).
    
    Idempotente: si el wallet ya es válido (dict con pro_messages_balance),
    retorna el user_doc sin modificaciones. Si es inválido (None, {}, o sin
    la clave pro_messages_balance), lo re-inicializa con 5 créditos free.
    
    Puede llamarse desde un endpoint admin o desde un health check para
    migrar/recuperar usuarios legacy con wallets corruptos.
    """
    wallet = user_doc.get("wallet")
    if _is_wallet_valid(wallet):
        return user_doc

    logger.warning(
        f"_repair_wallet: reparando wallet inválido para usuario {uid}. "
        f"Wallet actual: {wallet!r}"
    )
    from datetime import datetime, timezone

    email_verified = user_doc.get("email_verified", True)
    pro_messages = settings.plan_messages_map["free"] if email_verified else 0

    users_col = get_users_collection()
    now = datetime.now(timezone.utc)
    new_wallet = {
        "pro_messages_balance": pro_messages,
        "pro_messages_granted_this_period": pro_messages,
        "last_period_reset": now,
        "topup_messages_balance": 0,
    }
    await users_col.update_one(
        {"firebase_uid": uid},
        {"$set": _wallet_repair_set(wallet, new_wallet)},
    )
    user_doc["wallet"] = new_wallet
    logger.info(f"Wallet reparado para usuario {uid}: {pro_messages} créditos free")
    return user_doc


async def _auto_provision_user(firebase_claims: dict) -> dict:
    """
    Busca o crea el documento User en MongoDB basado en los claims de Firebase.
    Actualiza last_login_at en cada login.
    
    Email verification gate: si email_verified=False en Firebase, el usuario
    NO recibe créditos gratuitos. Debe verificar su email primero.
    Dev-token bypass: en modo dev, email_verified se asume True.
    """
    from datetime import datetime, timezone

    uid = firebase_claims["uid"]
    email = firebase_claims.get("email", "")
    display_name = firebase_claims.get("name", firebase_claims.get("email", "Usuario"))
    avatar_url = firebase_claims.get("picture")
    
    # Email verification gate
    email_verified = firebase_claims.get("email_verified", False)
    # Dev-token path: always treated as verified
    if not _firebase_initialized and settings.is_development:
        email_verified = True

    users_col = get_users_collection()

    user = await users_col.find_one({"firebase_uid": uid})

    if user:
        now = datetime.now(timezone.utc)
        update_set = {"last_login_at": now}

        # Upgrade al verificar email: si el usuario estaba como email_unverified
        # (0 créditos) y el claim de Firebase ya dice verificado, lo activamos y
        # le otorgamos sus créditos gratis UNA sola vez.
        was_unverified = (user.get("subscription") or {}).get("status") == "email_unverified"
        if email_verified and was_unverified:
            free_credits = settings.plan_messages_map["free"]
            update_set["subscription.status"] = "active"
            update_set["email_verified"] = True
            update_set["wallet.pro_messages_balance"] = free_credits
            update_set["wallet.pro_messages_granted_this_period"] = free_credits
            update_set["wallet.last_period_reset"] = now
            logger.info(f"✅ Email verificado para {uid}: activando cuenta y otorgando {free_credits} créditos")

        await users_col.update_one({"firebase_uid": uid}, {"$set": update_set})
        # Releer para devolver el estado actualizado (incluye el grant si aplicó).
        user = await users_col.find_one({"firebase_uid": uid})
        user = await _ensure_wallet(uid, user)
        user.pop("_id", None)
        return user

    # Auto-provision: crear nuevo usuario (upsert para evitar DuplicateKey en email vacío)
    now = datetime.now(timezone.utc)
    
    # Wallet: solo con créditos si el email está verificado
    pro_messages = settings.plan_messages_map["free"] if email_verified else 0
    subscription_status = "active" if email_verified else "email_unverified"
    
    new_user = {
        "firebase_uid": uid,
        "email": email,
        "display_name": display_name,
        "avatar_url": avatar_url,
        "created_at": now,
        # last_login_at se maneja en $set para evitar conflicto con $setOnInsert
        "wallet": {
            "pro_messages_balance": pro_messages,
            "pro_messages_granted_this_period": pro_messages,
            "last_period_reset": now,
            "topup_messages_balance": 0,
        },
        "subscription": {
            "plan_id": "free",
            "status": subscription_status,
        },
        "email_verified": email_verified,
        "onboarding_completed": False,
        "ui_preferences": {
            "theme": "system",
            "accent_color": "#7c3aed",
            "locale": "es-ES",
            "timezone": "Europe/Madrid",
            "artifact_default_open": True,
            "tool_confirmation_level": "destructive_only",
        },
        "professional_profile": {
            "role": None,
            "industry": None,
            "company_name": None,
            "company_stage": None,
            "team_size": None,
        },
        "communication_style": {
            "tone": "casual",
            "verbosity": "concise",
            "language_register": None,
        },
        "financial_preferences": {
            "base_currency": "EUR",
            "fiscal_year_start_month": 1,
        },
        "personal_kb_enabled": True,
        "feature_flags": [],
        "connected_providers": [],
        "usage": {
            "token_budget_daily": settings.TOKEN_BUDGET_DAILY_DEFAULT,
            "tokens_used_today": 0,
            "tokens_reset_at": now,
            "requests_in_current_window": 0,
        },
    }

    # Upsert: inserta si no existe, actualiza last_login_at si ya existe
    # Evita DuplicateKeyError cuando email="" (dos usuarios sin email)
    try:
        await users_col.update_one(
            {"firebase_uid": uid},
            {
                "$setOnInsert": new_user,
                "$set": {"last_login_at": now},
            },
            upsert=True,
        )
    except Exception as e:
        if "duplicate key" in str(e).lower():
            if email and email_verified:
                # Email collision: el mismo email ya está registrado con otro firebase_uid
                # (ej: Google + Email/Password del MISMO dueño). Solo fusionamos si el
                # token entrante tiene el email VERIFICADO: de lo contrario un atacante
                # podría registrar el email de una víctima (sin verificar) y recibir su
                # documento (y por tanto su firebase_uid y todos sus datos).
                existing = await users_col.find_one({"email": email})
                if existing:
                    logger.warning(
                        f"Email '{email}' ya registrado bajo UID {existing['firebase_uid']}. "
                        f"Login con UID {uid} redirigido al usuario existente."
                    )
                    await users_col.update_one(
                        {"_id": existing["_id"]},
                        {"$set": {"last_login_at": now}},
                    )
                    existing = await _ensure_wallet(existing["firebase_uid"], existing)
                    existing.pop("_id", None)
                    return existing
            # DuplicateKey sin email (ej: email="") — actualizar last_login por firebase_uid
            logger.debug(f"DuplicateKey sin email, actualizando login: {uid}")
            await users_col.update_one(
                {"firebase_uid": uid},
                {"$set": {"last_login_at": now}},
            )
        else:
            raise

    user = await users_col.find_one({"firebase_uid": uid})
    if user:
        user = await _ensure_wallet(uid, user)
        user.pop("_id", None)
    logger.info(f"Usuario auto-provisionado: {uid} ({email})")
    return user or new_user


def es_admin(user: dict) -> bool:
    """¿Esta cuenta tiene acceso al panel de administración?

    El ÚNICO sitio donde se decide. Lo consumen los dos lados que tienen que
    contestar lo mismo y que antes podían divergir:

    - `require_admin` (presentation/api/v1/admin.py), la guarda que corta los
      endpoints /admin con un 403.
    - el campo `is_admin` de GET /me, que es de donde el frontend saca si
      pinta el enlace del panel.

    Si estos dos se separan, o enseñamos un panel que luego responde 403, o le
    escondemos el panel a un administrador de verdad.

    Exige email verificado: el claim `email` de Firebase se rellena aunque el
    correo no esté verificado, así que sin este check un atacante podría
    registrar el email de un admin (sin verificarlo) y colarse en el panel.
    """
    email = (user.get("email") or "").strip().lower()
    if not email or email not in settings.admin_emails_list:
        return False
    return user.get("email_verified") is True


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    """
    FastAPI dependency: extrae y verifica el token del header Authorization.
    Retorna el documento User de MongoDB (con auto-provisioning).
    """
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Header Authorization requerido. Usa: Bearer <token>",
        )

    token = credentials.credentials
    firebase_claims = await _verify_token(token)
    user = await _auto_provision_user(firebase_claims)
    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict | None:
    """
    FastAPI dependency opcional: retorna User si hay token válido, None si no.
    Útil para endpoints que funcionan con o sin auth (ej: health check).
    """
    if credentials is None:
        return None

    try:
        token = credentials.credentials
        firebase_claims = await _verify_token(token)
        user = await _auto_provision_user(firebase_claims)
        return user
    except HTTPException:
        return None
