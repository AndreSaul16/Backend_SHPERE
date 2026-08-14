"""OAuth provider para Notion (BYO: client_id/secret vienen del usuario)."""
import httpx

# Notion no usa `scope` en la URL: los capabilities se definen al crear la
# integración en Notion. Se deja la constante por consistencia con los demás.
DEFAULT_SCOPES = ""


def authorize_url(
    state: str, client_id: str, redirect_uri: str, scopes: str = DEFAULT_SCOPES
) -> str:
    """Genera la URL de autorización de Notion OAuth."""
    return (
        f"https://api.notion.com/v1/oauth/authorize"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&owner=user"
        f"&state={state}"
    )


async def exchange_code(
    code: str, client_id: str, client_secret: str, redirect_uri: str
) -> dict:
    """Intercambia el code de autorización por tokens."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.notion.com/v1/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
            },
            auth=(client_id, client_secret),
        )
        resp.raise_for_status()
        data = resp.json()

        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token"),
            "scopes": [],  # Notion no devuelve scopes en el token response
            "expires_in": data.get("expires_in"),
        }


async def revoke(token: str, client_id: str = "", client_secret: str = ""):
    """Notion no tiene endpoint de revocación pública."""
