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
    Pairing,
    PairingExpired,
    YarukotoApi,
    YarukotoConnectionError,
    YarukotoError,
)
from .const import CONF_DEFAULT_LIST, CONF_FILTERS, DEVICE_NAME, DOMAIN

NO_DEFAULT_LIST = ""


def _normalize_url(url: str) -> str:
    return url.strip().rstrip("/")


class YarukotoConfigFlow(ConfigFlow, domain=DOMAIN):
    """Server address, then the sign-in code, then the filters."""

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
        return await self.async_step_filters()

    async def async_step_filters(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(
                title=urlparse(self._url).hostname or self._url,
                data={CONF_URL: self._url, CONF_TOKEN: self._token},
                options=_options_from(user_input),
            )
        schema = await _filters_schema(self._api(self._token), {})
        if schema is None:
            return self.async_abort(reason="cannot_connect")
        return self.async_show_form(step_id="filters", data_schema=schema)

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
    """Change which filters are shown, and where new items go."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=_options_from(user_input))
        entry = self.config_entry
        api = YarukotoApi(async_get_clientsession(self.hass), entry.data[CONF_URL], entry.data[CONF_TOKEN])
        schema = await _filters_schema(api, entry.options)
        if schema is None:
            return self.async_abort(reason="cannot_connect")
        return self.async_show_form(step_id="init", data_schema=schema)


def _options_from(user_input: dict[str, Any]) -> dict[str, Any]:
    default_list = user_input.get(CONF_DEFAULT_LIST) or None
    return {CONF_FILTERS: list(user_input.get(CONF_FILTERS, [])), CONF_DEFAULT_LIST: default_list}


async def _filters_schema(api: YarukotoApi, current: Mapping[str, Any]) -> vol.Schema | None:
    """The filter and list pickers, filled from the server; None if it can't be reached."""
    try:
        filters = await api.filters()
        lists = await api.lists()
    except YarukotoError:
        return None
    filter_options = [SelectOptionDict(value=f["id"], label=f["name"]) for f in filters]
    list_options = [SelectOptionDict(value=NO_DEFAULT_LIST, label="None")] + [
        SelectOptionDict(value=l["id"], label=l["name"]) for l in lists
    ]
    known = {f["id"] for f in filters}
    return vol.Schema(
        {
            vol.Optional(
                CONF_FILTERS, default=[f for f in current.get(CONF_FILTERS, []) if f in known]
            ): SelectSelector(SelectSelectorConfig(options=filter_options, multiple=True, mode=SelectSelectorMode.LIST)),
            vol.Optional(
                CONF_DEFAULT_LIST, default=current.get(CONF_DEFAULT_LIST) or NO_DEFAULT_LIST
            ): SelectSelector(SelectSelectorConfig(options=list_options, mode=SelectSelectorMode.DROPDOWN)),
        }
    )
