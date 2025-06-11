import httpx
import os
import jwt
from datetime import datetime
from datetime import timedelta
from discord.ext import commands

from urllib.parse import quote

from typing import List

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is not set")

API_KEY = jwt.encode({
    "iss": "jukebox-bot",
    "exp": datetime.now() + timedelta(weeks=9999),
}, JWT_SECRET, algorithm="HS256")

_client = httpx.AsyncClient(
    base_url=os.getenv("API_BASE_URL"),
)

async def _get_instance_id_from_context(ctx: commands.Context) -> str | None:
    user_id = str(ctx.author.id)
    resp = await _client.get(f"/api/user/{user_id}", headers={"Authorization": f"Bearer {API_KEY}"})
    resp.raise_for_status()

    return resp.json()["associatedInstanceId"]

async def get_token_from_context(ctx: commands.Context) -> str:
    instance_id = await _get_instance_id_from_context(ctx)

    payload = {
        "user_id": str(ctx.author.id),
        "instance_id": instance_id,
        "exp": datetime.now() + timedelta(days=7),
        "iss": "jukebox-bot"
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    return token



#async def add_tracks(tracks: List[str]) -> None:
    #resp = await _client.post("/api/tracks", json=tracks, headers={"Authorization": f"Bearer {API_KEY}"})
    #resp.raise_for_status()
    #return resp.json()

async def add_to_queue(token: str, url_or_query: str) -> None:
    resp = await _client.post(f"/api/queue/items?urlOrQuery={quote(url_or_query)}", headers={"Authorization": f"Bearer {token}"}, timeout=60)
    resp.raise_for_status()
    return resp.json()

async def get_queue(token: str, start: int | None = None, end: int | None = None) -> List[str]:
    resp = await _client.get(f"/api/queue/items?start={start}&end={end}", headers={"Authorization": f"Bearer {token}"})
    resp.raise_for_status()
    return resp.json()

async def remove_from_queue(token: str, id: int) -> None:
    resp = await _client.delete(f"/api/queue/items/{id}", headers={"Authorization": f"Bearer {token}"})
    resp.raise_for_status()
    return resp.json()

async def clear_queue(token: str) -> None:
    resp = await _client.delete(f"/api/queue", headers={"Authorization": f"Bearer {token}"})
    resp.raise_for_status()
    return resp.json()

async def shuffle_queue(token: str) -> None:
    resp = await _client.patch("/api/queue/shuffle", headers={"Authorization": f"Bearer {token}"})
    resp.raise_for_status()
    return resp.json()

async def move_queue_item(token: str, old_index: int, new_index: int) -> None:
    resp = await _client.patch(f"/api/queue/move/{old_index}/{new_index}", headers={"Authorization": f"Bearer {token}"})
    resp.raise_for_status()
    return resp.json()
    
async def skip(token: str, amount: int) -> None:
    resp = await _client.patch(f"/api/queue/skip?amount={amount}", headers={"Authorization": f"Bearer {token}"})
    resp.raise_for_status()
    return resp.json()

