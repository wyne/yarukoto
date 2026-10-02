"""Polls the lists and saved filters this integration shows."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import INBOX, YarukotoApi, YarukotoAuthError, YarukotoError
from .const import CONF_FILTERS, CONF_LISTS, DOMAIN, SCAN_INTERVAL

_LOGGER = logging.getLogger(__name__)


@dataclass
class Snapshot:
    """What one to-do list showed on the last poll."""

    name: str
    tasks: list[dict[str, Any]]


@dataclass
class YarukotoData:
    lists: dict[str, Snapshot] = field(default_factory=dict)
    filters: dict[str, Snapshot] = field(default_factory=dict)


class YarukotoCoordinator(DataUpdateCoordinator[YarukotoData]):
    """
    One poll for every chosen list and filter.

    One deleted in the app, or no longer visible to this sign-in, is simply
    missing from the result, and its to-do list goes unavailable rather than
    failing the others.
    """

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, api: YarukotoApi) -> None:
        super().__init__(hass, _LOGGER, name=DOMAIN, update_interval=SCAN_INTERVAL, config_entry=entry)
        self.api = api

    async def _async_update_data(self) -> YarukotoData:
        options = self.config_entry.options
        data = YarukotoData()
        try:
            wanted_lists: list[str] = options.get(CONF_LISTS, [])
            if wanted_lists:
                names = {item["id"]: item["name"] for item in await self.api.lists()}
                names[INBOX] = "Inbox"
                for list_id in wanted_lists:
                    if list_id in names:
                        data.lists[list_id] = Snapshot(names[list_id], await self.api.list_tasks(list_id))
            for filter_id in options.get(CONF_FILTERS, []):
                try:
                    answer = await self.api.filter_tasks(filter_id)
                except YarukotoError as err:
                    if err.status == 404:
                        continue
                    raise
                data.filters[filter_id] = Snapshot(answer["filter"]["name"], answer["tasks"])
        except YarukotoAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except YarukotoError as err:
            raise UpdateFailed(str(err)) from err
        return data
