"""Sign in to a Yarukoto server and choose which saved filters to show.

There is no password to type. Home Assistant asks the server for a sign-in
code, someone approves it in the app as an integration, and the server hands
this flow its own token, one that sees only the household's shared lists.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from urllib.parse import urlparse

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_TOKEN, CONF_URL
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
)

from .api import (
    HOUSEHOLD_FEATURE,
    INBOX,
    Pairing,
    PairingExpired,
    YarukotoApi,
    YarukotoConnectionError,
    YarukotoError,
)
from .const import CONF_FILTERS, CONF_LISTS, DEVICE_NAME, DOMAIN

def _normalize_url(url: str) -> str:
    return url.strip().rstrip("/")


class YarukotoConfigFlow(ConfigFlow, domain=DOMAIN):
    """Server address, then the sign-in code, then the lists and filters."""

    VERSION = 1

    def __init__(self) -> None:
        self._url: str | None = None
        self._pairing: Pairing | None = None
        self._token: str | None = None

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return YarukotoOptionsFlow()

    def _api(self, token: str | None = None) -> YarukotoApi:
        assert self._url is not None
        return YarukotoApi(async_get_clientsession(self.hass), self._url, token)

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            url = _normalize_url(user_input[CONF_URL])
            if urlparse(url).scheme not in ("http", "https"):
                errors[CONF_URL] = "invalid_url"
            else:
                await self.async_set_unique_id(url)
                self._abort_if_unique_id_configured()
                self._url = url
                errors = await self._start_pairing()
                if not errors:
                    return await self.async_step_pair()
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required(CONF_URL, default=(user_input or {}).get(CONF_URL, "")): str}),
            errors=errors,
        )

    async def _start_pairing(self) -> dict[str, str]:
        api = self._api()
        try:
            if HOUSEHOLD_FEATURE not in await api.features():
                return {"base": "server_too_old"}
            self._pairing = await api.start_pairing(DEVICE_NAME)
        except YarukotoConnectionError:
            return {"base": "cannot_connect"}
        except YarukotoError:
            return {"base": "unknown"}
        return {}

    async def async_step_pair(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Shows the code, and checks for approval each time it's submitted."""
        assert self._pairing is not None
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                token = await self._api().claim_pairing(self._pairing)
            except PairingExpired:
                # Nothing to recover: a fresh code, shown in place of the old one.
                errors = await self._start_pairing() or {"base": "code_expired"}
            except YarukotoConnectionError:
                errors = {"base": "cannot_connect"}
            except YarukotoError:
                errors = {"base": "unknown"}
            else:
                if token is None:
                    errors = {"base": "not_approved"}
                else:
                    self._token = token
                    return await self._signed_in()
        return self.async_show_form(
            step_id="pair",
            data_schema=vol.Schema({}),
            description_placeholders={"code": self._pairing.code, "url": self._url or ""},
            errors=errors,
        )

    async def _signed_in(self) -> ConfigFlowResult:
        data = {CONF_URL: self._url, CONF_TOKEN: self._token}
        if self.source == "reauth":
            return self.async_update_reload_and_abort(self._get_reauth_entry(), data=data)
        return await self.async_step_choose()

    async def async_step_choose(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(
                title=urlparse(self._url).hostname or self._url,
                data={CONF_URL: self._url, CONF_TOKEN: self._token},
                options=_options_from(user_input),
            )
        schema = await _choose_schema(self._api(self._token), {})
        if schema is None:
            return self.async_abort(reason="cannot_connect")
        return self.async_show_form(step_id="choose", data_schema=schema)

    async def async_step_reauth(self, entry_data: Mapping[str, Any]) -> ConfigFlowResult:
        self._url = entry_data[CONF_URL]
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = await self._start_pairing()
            if not errors:
                return await self.async_step_pair()
        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=vol.Schema({}),
            description_placeholders={"url": self._url or ""},
            errors=errors,
        )


class YarukotoOptionsFlow(OptionsFlow):
    """Change which lists and filters are shown."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=_options_from(user_input))
        entry = self.config_entry
        api = YarukotoApi(async_get_clientsession(self.hass), entry.data[CONF_URL], entry.data[CONF_TOKEN])
        schema = await _choose_schema(api, entry.options)
        if schema is None:
            return self.async_abort(reason="cannot_connect")
        return self.async_show_form(step_id="init", data_schema=schema)


def _options_from(user_input: dict[str, Any]) -> dict[str, Any]:
    return {
        CONF_LISTS: list(user_input.get(CONF_LISTS, [])),
        CONF_FILTERS: list(user_input.get(CONF_FILTERS, [])),
    }


async def _choose_schema(api: YarukotoApi, current: Mapping[str, Any]) -> vol.Schema | None:
    """The list and filter pickers, filled from the server; None if it can't be reached."""
    try:
        lists = await api.lists()
        filters = await api.filters()
        me = await api.me()
    except YarukotoError:
        return None
    list_options = [SelectOptionDict(value=item["id"], label=item["name"]) for item in lists]
    # Only a person has an Inbox. Approved as an integration, there is none to show.
    if me.get("member"):
        list_options.insert(0, SelectOptionDict(value=INBOX, label="Inbox"))
    filter_options = [SelectOptionDict(value=item["id"], label=item["name"]) for item in filters]

    def picker(key: str, options: list[SelectOptionDict]) -> dict[Any, Any]:
        known = {option["value"] for option in options}
        default = [value for value in current.get(key, []) if value in known]
        return {
            vol.Optional(key, default=default): SelectSelector(
                SelectSelectorConfig(options=options, multiple=True, mode=SelectSelectorMode.LIST)
            )
        }

    return vol.Schema({**picker(CONF_LISTS, list_options), **picker(CONF_FILTERS, filter_options)})
