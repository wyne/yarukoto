"""Yarukoto saved filters as Home Assistant to-do lists."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_TOKEN, CONF_URL, Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import YarukotoApi
from .coordinator import YarukotoCoordinator

PLATFORMS = [Platform.TODO]

type YarukotoConfigEntry = ConfigEntry[YarukotoCoordinator]


async def async_setup_entry(hass: HomeAssistant, entry: YarukotoConfigEntry) -> bool:
    api = YarukotoApi(async_get_clientsession(hass), entry.data[CONF_URL], entry.data[CONF_TOKEN])
    coordinator = YarukotoCoordinator(hass, entry, api)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    # Choosing different filters adds and removes entities, so it reloads.
    entry.async_on_unload(entry.add_update_listener(_reload))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: YarukotoConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _reload(hass: HomeAssistant, entry: YarukotoConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)
