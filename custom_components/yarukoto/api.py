"""A small client for the Yarukoto server's task API.

Home Assistant never syncs whole rows the way the app does. It reads saved
filters through `/api/v1/filters/:id/tasks`, which evaluates them with the
app's own matcher, and writes one field at a time through `/api/v1/tasks`, so
nothing here can overwrite a field it didn't mean to touch.

Kept free of Home Assistant imports so the date handling can be tested alone.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime, tzinfo
from typing import Any

import aiohttp

HOUSEHOLD_FEATURE = "household"
"""The server feature that carries sign-in codes; older servers only take an access token."""

INBOX_LIST_ID = "__inbox"
"""How a saved filter names the Inbox, which an integration can never write to."""


class YarukotoError(Exception):
    """The server answered with an error."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class YarukotoConnectionError(YarukotoError):
    """The server could not be reached."""


class YarukotoAuthError(YarukotoError):
    """The server no longer accepts this integration's token."""


class PairingExpired(YarukotoError):
    """The sign-in code expired, or was already used, before it was approved."""


@dataclass
class Pairing:
    """A sign-in code waiting for someone in the app to approve it."""

    pairing_id: str
    secret: str
    code: str
    expires_at: str


class YarukotoApi:
    """Talks to one Yarukoto server, with or without a token yet."""

    def __init__(self, session: aiohttp.ClientSession, url: str, token: str | None = None) -> None:
        self._session = session
        self.url = url.rstrip("/")
        self.token = token

    async def _request(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        try:
            async with self._session.request(
                method,
                f"{self.url}{path}",
                headers=headers,
                # Only with a body: the server refuses an empty body labelled JSON.
                json=body,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as res:
                text = await res.text()
                payload = json.loads(text) if text.strip() else None
                if res.status == 401:
                    raise YarukotoAuthError("The server no longer accepts this sign-in")
                if res.status >= 400:
                    message = payload.get("message") if isinstance(payload, dict) else None
                    raise YarukotoError(message or f"Server responded with {res.status}", res.status)
                return payload
        except (aiohttp.ClientError, TimeoutError) as err:
            raise YarukotoConnectionError(f"Could not reach {self.url}") from err
        except ValueError as err:
            raise YarukotoConnectionError(f"{self.url} did not answer as a Yarukoto server") from err

    async def features(self) -> list[str]:
        """What the server can do; raises if it isn't a Yarukoto server at all."""
        health = await self._request("GET", "/api/v1/health")
        if not isinstance(health, dict) or health.get("ok") is not True:
            raise YarukotoConnectionError(f"{self.url} did not answer as a Yarukoto server")
        return list(health.get("features") or [])

    async def start_pairing(self, name: str) -> Pairing:
        started = await self._request("POST", "/api/v1/pair/start", {"name": name})
        return Pairing(started["pairingId"], started["secret"], started["code"], started["expiresAt"])

    async def claim_pairing(self, pairing: Pairing) -> str | None:
        """The token once someone has approved the code, or None while it waits."""
        try:
            result = await self._request(
                "POST", "/api/v1/pair/poll", {"pairingId": pairing.pairing_id, "secret": pairing.secret}
            )
        except YarukotoError as err:
            # 404: already claimed or never issued. 410: expired.
            if err.status in (404, 410):
                raise PairingExpired(str(err), err.status) from err
            raise
        return result.get("token") if result.get("status") == "approved" else None

    async def me(self) -> dict[str, Any]:
        return await self._request("GET", "/api/v1/me")

    async def filters(self) -> list[dict[str, Any]]:
        return (await self._request("GET", "/api/v1/filters"))["filters"]

    async def filter_tasks(self, filter_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/api/v1/filters/{filter_id}/tasks")

    async def lists(self) -> list[dict[str, Any]]:
        return (await self._request("GET", "/api/v1/lists"))["lists"]

    async def create_task(self, fields: dict[str, Any]) -> dict[str, Any]:
        return (await self._request("POST", "/api/v1/tasks", fields))["task"]

    async def update_task(self, task_id: str, fields: dict[str, Any]) -> dict[str, Any]:
        return (await self._request("PATCH", f"/api/v1/tasks/{task_id}", fields))["task"]

    async def delete_task(self, task_id: str) -> None:
        await self._request("DELETE", f"/api/v1/tasks/{task_id}")


def task_due(task: dict[str, Any], zone: tzinfo) -> date | datetime | None:
    """A task's due date as Home Assistant wants it: a date, or a time in `zone`."""
    due_date = task.get("dueDate")
    if not due_date:
        return None
    day = date.fromisoformat(due_date)
    due_time = task.get("dueTime")
    if not due_time:
        return day
    hour, minute = (int(part) for part in due_time.split(":"))
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=zone)


def due_fields(due: date | datetime | None, zone: tzinfo) -> dict[str, str | None]:
    """The API fields for a due date from Home Assistant; None clears both."""
    if due is None:
        return {"dueDate": None, "dueTime": None}
    if isinstance(due, datetime):
        local = due.astimezone(zone) if due.tzinfo else due.replace(tzinfo=zone)
        return {"dueDate": local.date().isoformat(), "dueTime": local.strftime("%H:%M")}
    return {"dueDate": due.isoformat(), "dueTime": None}


def list_for_new_items(criteria: dict[str, Any], default_list: str | None) -> str | None:
    """
    Which list a task added to this filter's to-do list goes into.

    A filter that names exactly one list keeps its new items there, so they
    show up where they were added. Anything else falls back to the list chosen
    in the options, since a filter can span lists, or name none at all.
    """
    list_ids = [list_id for list_id in criteria.get("listIds") or [] if list_id != INBOX_LIST_ID]
    if len(list_ids) == 1 and not criteria.get("folderIds"):
        return list_ids[0]
    return default_list
