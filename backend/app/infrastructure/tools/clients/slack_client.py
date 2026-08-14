"""
Cliente atómico para Slack API.
"""
import httpx


async def post_message(access_token: str, channel: str, text: str) -> dict:
    """Publica un mensaje en un canal de Slack."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://slack.com/api/chat.postMessage",
            json={"channel": channel, "text": text},
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise ValueError(f"Slack error: {data.get('error', 'unknown')}")
        return {"channel": data.get("channel"), "ts": data.get("ts")}


async def list_channels(access_token: str) -> list[dict]:
    """Lista los canales accesibles del workspace."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://slack.com/api/conversations.list",
            params={"types": "public_channel", "limit": 100},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise ValueError(f"Slack error: {data.get('error', 'unknown')}")
        return [
            {"id": ch["id"], "name": ch["name"]}
            for ch in data.get("channels", [])
        ]
