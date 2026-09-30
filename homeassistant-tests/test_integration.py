"""The config flow and to-do lists against a mocked Yarukoto server."""

from datetime import date

import pytest
from homeassistant import config_entries
from homeassistant.components.todo import DOMAIN as TODO_DOMAIN
from homeassistant.const import CONF_TOKEN, CONF_URL
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import HomeAssistantError
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker

from custom_components.yarukoto.const import CONF_DEFAULT_LIST, CONF_FILTERS, DOMAIN

URL = "http://yarukoto.local:8080"
HEALTH = {"ok": True, "features": ["taskReminders", "savedFilters", "household"]}
FAMILY = {"id": "sf-family", "name": "Family today", "criteria": {"listIds": ["l-family"], "folderIds": [], "due": ["today"]}}
EVERYTHING = {"id": "sf-all", "name": "Everything shared", "criteria": {"listIds": [], "folderIds": []}}
MILK = {"id": "t-milk", "title": "Buy milk", "notes": "", "completed": False, "dueDate": "2026-10-02", "listId": "l-family"}


def mock_server(aioclient_mock: AiohttpClientMocker) -> None:
    aioclient_mock.get(f"{URL}/api/v1/health", json=HEALTH)
    aioclient_mock.get(f"{URL}/api/v1/filters", json={"filters": [FAMILY, EVERYTHING]})
    aioclient_mock.get(f"{URL}/api/v1/lists", json={"lists": [{"id": "l-family", "name": "Family"}]})
    aioclient_mock.get(f"{URL}/api/v1/filters/sf-family/tasks", json={"today": "2026-10-02", "filter": FAMILY, "tasks": [MILK]})
    aioclient_mock.get(f"{URL}/api/v1/filters/sf-all/tasks", json={"today": "2026-10-02", "filter": EVERYTHING, "tasks": [MILK]})


async def test_signing_in_with_a_code_and_choosing_filters(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker):
    mock_server(aioclient_mock)
    aioclient_mock.post(
        f"{URL}/api/v1/pair/start",
        json={"pairingId": "p-1", "secret": "s", "code": "ABCD-2345", "expiresAt": "2026-10-02T10:00:00Z"},
    )
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["type"] is FlowResultType.FORM

    result = await hass.config_entries.flow.async_configure(result["flow_id"], {CONF_URL: f"{URL}/"})
    assert result["step_id"] == "pair"
    assert result["description_placeholders"]["code"] == "ABCD-2345"

    # Submitted before anyone approved it: stays on the code, says so.
    aioclient_mock.post(f"{URL}/api/v1/pair/poll", json={"status": "pending"})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["errors"] == {"base": "not_approved"}

    aioclient_mock.clear_requests()
    mock_server(aioclient_mock)
    aioclient_mock.post(f"{URL}/api/v1/pair/poll", json={"status": "approved", "token": "tok-ha"})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["step_id"] == "filters"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_FILTERS: ["sf-family"], CONF_DEFAULT_LIST: ""}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"] == {CONF_URL: URL, CONF_TOKEN: "tok-ha"}
    assert result["options"] == {CONF_FILTERS: ["sf-family"], CONF_DEFAULT_LIST: None}
    assert result["title"] == "yarukoto.local"


async def test_a_server_without_households_is_turned_away(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker):
    aioclient_mock.get(f"{URL}/api/v1/health", json={"ok": True, "features": ["taskReminders"]})
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {CONF_URL: URL})
    assert result["errors"] == {"base": "server_too_old"}


async def test_an_expired_code_is_replaced_with_a_new_one(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker):
    aioclient_mock.get(f"{URL}/api/v1/health", json=HEALTH)
    aioclient_mock.post(
        f"{URL}/api/v1/pair/start",
        json={"pairingId": "p-1", "secret": "s", "code": "ABCD-2345", "expiresAt": "x"},
    )
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {CONF_URL: URL})

    aioclient_mock.clear_requests()
    aioclient_mock.get(f"{URL}/api/v1/health", json=HEALTH)
    aioclient_mock.post(f"{URL}/api/v1/pair/poll", status=410, json={"error": "gone", "message": "expired"})
    aioclient_mock.post(
        f"{URL}/api/v1/pair/start",
        json={"pairingId": "p-2", "secret": "s2", "code": "WXYZ-6789", "expiresAt": "x"},
    )
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["step_id"] == "pair"
    assert result["description_placeholders"]["code"] == "WXYZ-6789"


async def set_up(hass: HomeAssistant, filters: list[str], default_list: str | None = None) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="yarukoto.local",
        unique_id=URL,
        data={CONF_URL: URL, CONF_TOKEN: "tok-ha"},
        options={CONF_FILTERS: filters, CONF_DEFAULT_LIST: default_list},
    )
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_each_filter_is_a_todo_list(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker):
    mock_server(aioclient_mock)
    await set_up(hass, ["sf-family"])
    state = hass.states.get("todo.yarukoto_local_family_today")
    assert state is not None
    assert state.state == "1"

    items = await hass.services.async_call(
        TODO_DOMAIN, "get_items", {}, target={"entity_id": state.entity_id}, blocking=True, return_response=True
    )
    item = items[state.entity_id]["items"][0]
    assert item["summary"] == "Buy milk"
    assert item["due"] == "2026-10-02"
    # The token goes on every request.
    assert all(call[3]["Authorization"] == "Bearer tok-ha" for call in aioclient_mock.mock_calls)


async def test_items_are_written_one_field_at_a_time(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker):
    mock_server(aioclient_mock)
    aioclient_mock.post(f"{URL}/api/v1/tasks", json={"task": MILK})
    aioclient_mock.patch(f"{URL}/api/v1/tasks/t-milk", json={"task": MILK})
    aioclient_mock.delete(f"{URL}/api/v1/tasks/t-milk", json={"task": MILK})
    await set_up(hass, ["sf-family"])
    entity = "todo.yarukoto_local_family_today"

    await hass.services.async_call(
        TODO_DOMAIN, "add_item", {"item": "Bread", "due_date": date(2026, 10, 3)}, target={"entity_id": entity}, blocking=True
    )
    await hass.services.async_call(
        TODO_DOMAIN, "update_item", {"item": "t-milk", "status": "completed"}, target={"entity_id": entity}, blocking=True
    )
    await hass.services.async_call(TODO_DOMAIN, "remove_item", {"item": "t-milk"}, target={"entity_id": entity}, blocking=True)

    writes = [(str(call[1]), call[0], call[2]) for call in aioclient_mock.mock_calls if call[0] != "GET"]
    assert writes[0] == (
        f"{URL}/api/v1/tasks",
        "POST",
        {"title": "Bread", "listId": "l-family", "notes": "", "dueDate": "2026-10-03", "dueTime": None},
    )
    assert writes[1][1] == "PATCH"
    assert writes[1][2]["completed"] is True
    assert writes[1][2]["title"] == "Buy milk"
    assert writes[2][:2] == (f"{URL}/api/v1/tasks/t-milk", "DELETE")
    assert writes[2][2] is None


async def test_adding_to_a_filter_over_several_lists_needs_a_default(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker):
    mock_server(aioclient_mock)
    await set_up(hass, ["sf-all"])
    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            TODO_DOMAIN, "add_item", {"item": "Bread"}, target={"entity_id": "todo.yarukoto_local_everything_shared"}, blocking=True
        )


async def test_a_signed_out_integration_asks_to_sign_in_again(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker):
    aioclient_mock.get(f"{URL}/api/v1/filters/sf-family/tasks", status=401, json={"error": "signed_out"})
    entry = await set_up(hass, ["sf-family"])
    assert entry.state is config_entries.ConfigEntryState.SETUP_ERROR
    flows = hass.config_entries.flow.async_progress()
    assert [flow["context"]["source"] for flow in flows] == ["reauth"]
