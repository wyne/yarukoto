"""Polls the saved filters this integration shows."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import YarukotoApi, YarukotoAuthError, YarukotoError
from .const import CONF_FILTERS, DOMAIN, SCAN_INTERVAL

_LOGGER = logging.getLogger(__name__)


@dataclass
class FilterSnapshot:
    """One saved filter and the tasks it admitted on the last poll."""

    filter: dict[str, Any]
    tasks: list[dict[str, Any]]


class YarukotoCoordinator(DataUpdateCoordinator[dict[str, FilterSnapshot]]):
    """
    One poll for every chosen filter, keyed by filter id.

    A filter deleted in the app, or no longer visible to this integration, is
    simply missing from the result, and its to-do list goes unavailable rather
    than failing the others.
    """

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, api: YarukotoApi) -> None:
        super().__init__(hass, _LOGGER, name=DOMAIN, update_interval=SCAN_INTERVAL, config_entry=entry)
        self.api = api

    async def _async_update_data(self) -> dict[str, FilterSnapshot]:
        wanted: list[str] = self.config_entry.options.get(CONF_FILTERS, [])
        result: dict[str, FilterSnapshot] = {}
        try:
            for filter_id in wanted:
                try:
                    answer = await self.api.filter_tasks(filter_id)
                except YarukotoAuthError:
                    raise
                except YarukotoError as err:
                    if err.status == 404:
                        continue
                    raise
                result[filter_id] = FilterSnapshot(answer["filter"], answer["tasks"])
        except YarukotoAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except YarukotoError as err:
            raise UpdateFailed(str(err)) from err
        return result
