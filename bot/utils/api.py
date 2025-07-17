import httpx
import os
import jwt
from datetime import datetime
from datetime import timedelta
from discord.ext import commands
from utils.config import API_BASE_URL, JWT_SECRET

from urllib.parse import quote

from typing import List, Dict, Optional, TypedDict


# Type definitions for API responses
class CurrentTrackDto(TypedDict):
    index: int
    id: str


class RoomInfoDto(TypedDict):
    room_code: str
    is_paused: bool
    is_looping: bool
    is_shuffled: bool
    current_track: CurrentTrackDto
    playing_since: Optional[int]


class QueueItemDto(TypedDict):
    id: int
    track_id: str
    index: int
    shuffled_index: Optional[int]
    is_deleted: bool


class RoomResponse(TypedDict):
    room_info: RoomInfoDto
    queue_items: List[QueueItemDto]


# Track API response types
class TrackDto(TypedDict):
    id: str
    webpage_url: str
    title: str
    uploader: str


class TracksRequestDto(TypedDict):
    webpage_url_hashes: list[str]


API_KEY = jwt.encode(
    {
        "iss": "bot-KoodaamoJukebox",
        "exp": datetime.now() + timedelta(weeks=9999),
    },
    JWT_SECRET,
    algorithm="HS256",
)

_client = httpx.AsyncClient(
    base_url=API_BASE_URL,
)


class ApiError(Exception):
    def __init__(self, status_code: int, title: str, detail: str = None):
        self.status_code = status_code
        self.title = title
        self.detail = detail
        super().__init__(f"{title}: {detail if detail else ''}")

def _handle_api_response(resp: httpx.Response):
    if resp.status_code >= 200 and resp.status_code < 300:
        return resp
    try:
        problem = resp.json()
        title = problem.get("title", "Error")
        detail = problem.get("detail", "")
    except Exception:
        title = "Unknown error"
        detail = resp.text
    raise ApiError(resp.status_code, title, detail)


async def _get_room_code_from_context(ctx: commands.Context) -> str | None:
    user_id = str(ctx.author.id)
    resp = await _client.get(
        f"/api/user/{user_id}", headers={"Authorization": f"Bearer {API_KEY}"}
    )
    _handle_api_response(resp)
    return resp.json()["associated_room_code"]


async def get_token_from_context(ctx: commands.Context) -> str:
    room_code = await _get_room_code_from_context(ctx)

    payload = {
        "user_id": str(ctx.author.id),
        "room_code": room_code,
        "exp": datetime.now() + timedelta(days=7),
        "iss": "bot-KoodaamoJukebox",
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    return token

async def get_all_users():
    """Get all users in the room"""
    resp = await _client.get(
        "/api/user",
        headers={"Authorization": f"Bearer {API_KEY}"},
        timeout=60,
    )
    _handle_api_response(resp)
    return resp.json()

async def add_to_queue(token: str, url_or_query: str) -> None:
    resp = await _client.post(
        f"/api/queue/items?urlOrQuery={quote(url_or_query)}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    _handle_api_response(resp)
    return resp.json()


async def get_queue(token: str) -> List[dict]:
    resp = await _client.get(
        "/api/queue/items", headers={"Authorization": f"Bearer {token}"}, timeout=60
    )
    _handle_api_response(resp)
    return resp.json()


async def get_room_info(token: str) -> dict:
    resp = await _client.get(
        "/api/room/info", headers={"Authorization": f"Bearer {token}"}, timeout=60
    )
    _handle_api_response(resp)
    return resp.json()


def _get_current_timestamp() -> int:
    """Get current timestamp in milliseconds"""
    return int(datetime.now().timestamp() * 1000)


# Track API endpoints
async def get_track(token: str, webpage_url_hash: str) -> TrackDto:
    """Get a single track by its webpageUrlHash"""
    resp = await _client.get(
        f"/api/track/{webpage_url_hash}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    _handle_api_response(resp)
    return resp.json()


async def get_tracks(token: str, webpage_url_hashes: list[str]) -> list[TrackDto]:
    """Get multiple tracks by their webpageUrlHashes"""
    data = {"webpage_url_hashes": webpage_url_hashes}
    resp = await _client.post(
        "/api/track",
        headers={"Authorization": f"Bearer {token}"},
        json=data,
        timeout=60,
    )
    _handle_api_response(resp)
    return resp.json()


async def get_track_thumbnail_high(webpage_url_hash: str) -> str:
    """Get the high quality thumbnail URL for a track (no auth required)"""
    # Returns a redirect URL, so just build the endpoint
    return f"{API_BASE_URL}/api/track/{webpage_url_hash}/thumbnail-high"


async def get_track_thumbnail_low(webpage_url_hash: str) -> str:
    """Get the low quality thumbnail URL for a track (no auth required)"""
    return f"{API_BASE_URL}/api/track/{webpage_url_hash}/thumbnail-low"


# Room API endpoints
async def get_room(token: str) -> RoomResponse:
    """Get current room information and queue"""
    resp = await _client.get(
        "/api/room", headers={"Authorization": f"Bearer {token}"}, timeout=60
    )
    _handle_api_response(resp)
    return resp.json()


async def pause_toggle(token: str, paused: bool) -> RoomResponse:
    """Toggle pause state"""
    data = {"sentAt": _get_current_timestamp(), "value": paused}
    resp = await _client.post(
        "/api/room/pause",
        headers={"Authorization": f"Bearer {token}"},
        json=data,
        timeout=60,
    )
    _handle_api_response(resp)
    return resp.json()


async def loop_toggle(token: str, loop: bool) -> RoomResponse:
    """Toggle loop state"""
    data = {"sentAt": _get_current_timestamp(), "value": loop}
    resp = await _client.post(
        "/api/room/loop",
        headers={"Authorization": f"Bearer {token}"},
        json=data,
        timeout=60,
    )
    _handle_api_response(resp)
    return resp.json()


async def shuffle_toggle(token: str, shuffled: bool) -> RoomResponse:
    """Toggle shuffle state"""
    data = {"sentAt": _get_current_timestamp(), "value": shuffled}
    resp = await _client.post(
        "/api/room/shuffle",
        headers={"Authorization": f"Bearer {token}"},
        json=data,
        timeout=60,
    )
    _handle_api_response(resp)
    return resp.json()


async def seek(token: str, seek_time: int) -> RoomResponse:
    """Seek to a specific time in the current track (in seconds)"""
    data = {"sentAt": _get_current_timestamp(), "value": seek_time}
    resp = await _client.post(
        "/api/room/seek",
        headers={"Authorization": f"Bearer {token}"},
        json=data,
        timeout=60,
    )
    _handle_api_response(resp)
    return resp.json()


async def skip(token: str, index: int) -> RoomResponse:
    """Skip to a specific track by index"""
    data = {"sentAt": _get_current_timestamp(), "value": index}
    resp = await _client.post(
        "/api/room/skip",
        headers={"Authorization": f"Bearer {token}"},
        json=data,
        timeout=60,
    )
    _handle_api_response(resp)
    return resp.json()


async def move_track(token: str, from_index: int, to_index: int) -> RoomResponse:
    """Move a track from one position to another"""
    data = {"sentAt": _get_current_timestamp(), "from": from_index, "to": to_index}
    resp = await _client.post(
        "/api/room/move",
        headers={"Authorization": f"Bearer {token}"},
        json=data,
        timeout=60,
    )
    _handle_api_response(resp)
    return resp.json()


async def add_track(token: str, url_or_query: str) -> RoomResponse:
    """Add a track to the queue"""
    data = {"sentAt": _get_current_timestamp(), "value": url_or_query}
    resp = await _client.post(
        "/api/room/add",
        headers={"Authorization": f"Bearer {token}"},
        json=data,
        timeout=60,
    )
    _handle_api_response(resp)
    return resp.json()


async def remove_track(token: str, track_id: int) -> RoomResponse:
    """Remove a track from the queue by ID"""
    data = {"sentAt": _get_current_timestamp(), "value": track_id}
    resp = await _client.post(
        "/api/room/remove",
        headers={"Authorization": f"Bearer {token}"},
        json=data,
        timeout=60,
    )
    _handle_api_response(resp)
    return resp.json()


async def delete_track(token: str, index: int) -> RoomResponse:
    """Delete a track from the queue by index"""
    data = {"sentAt": _get_current_timestamp(), "value": index}
    resp = await _client.post(
        "/api/room/delete",
        headers={"Authorization": f"Bearer {token}"},
        json=data,
        timeout=60,
    )
    _handle_api_response(resp)
    return resp.json()


async def clear_queue(token: str) -> RoomResponse:
    """Clear the queue"""
    data = {
        "sentAt": _get_current_timestamp(),
        "value": 0,  # Value is not used, but TimestampedIntRequest requires it
    }
    resp = await _client.post(
        "/api/room/clear",
        headers={"Authorization": f"Bearer {token}"},
        json=data,
        timeout=60,
    )
    _handle_api_response(resp)
    return resp.json()

async def ban_user(user_id: int, until: int, reason: str) -> None:
    """Ban a user from the room"""
    resp = await _client.post(
        f"/api/user/{user_id}/ban",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={
        "until": until,
        "reason": reason or "No reason provided",
    },
        timeout=60,
    )
    _handle_api_response(resp)

async def unban_user(user_id: int) -> None:
    """Unban a user from the room"""
    resp = await _client.post(
        f"/api/user/{user_id}/unban",
        headers={"Authorization": f"Bearer {API_KEY}"},
        timeout=60,
    )
    _handle_api_response(resp)

