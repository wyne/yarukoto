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

from custom_components.yarukoto.const import CONF_FILTERS, CONF_LISTS, DOMAIN

URL = "http://yarukoto.local:8080"
HEALTH = {"ok": True, "features": ["taskReminders", "savedFilters", "household"]}
HA_TAG = {"id": "sf-ha", "name": "Tagged HA", "criteria": {"listIds": [], "folderIds": [], "tags": ["ha"]}}
MILK = {"id": "t-milk", "title": "Buy milk", "notes": "", "completed": False, "dueDate": "2026-10-02", "listId": "l-family"}
LIGHTS = {"id": "t-lights", "title": "Fix porch light", "notes": "", "completed": False, "listId": "l-house", "tags": ["ha"]}
ME_PERSON = {"member": {"id": "u-owner", "name": "Justin"}, "device": None, "household": []}
ME_INTEGRATION = {"member": None, "device": {"id": "d-ha"}, "household": []}


def mock_server(aioclient_mock: AiohttpClientMocker, me: dict = ME_INTEGRATION) -> None:
    aioclient_mock.get(f"{URL}/api/v1/health", json=HEALTH)
    aioclient_mock.get(f"{URL}/api/v1/me", json=me)
    aioclient_mock.get(f"{URL}/api/v1/filters", json={"filters": [HA_TAG]})
    aioclient_mock.get(
        f"{URL}/api/v1/lists",
        json={"lists": [{"id": "l-family", "name": "Family"}, {"id": "l-house", "name": "House"}]},
    )
    aioclient_mock.get(f"{URL}/api/v1/tasks?listId=l-family&status=open&limit=500", json={"tasks": [MILK]})
    aioclient_mock.get(f"{URL}/api/v1/tasks?listId=inbox&status=open&limit=500", json={"tasks": []})
    aioclient_mock.get(f"{URL}/api/v1/filters/sf-ha/tasks", json={"today": "2026-10-02", "filter": HA_TAG, "tasks": [LIGHTS]})


async def start_flow(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> dict:
    aioclient_mock.post(
        f"{URL}/api/v1/pair/start",
        json={"pairingId": "p-1", "secret": "s", "code": "ABCD-2345", "expiresAt": "2026-10-02T10:00:00Z"},
    )
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    return await hass.config_entries.flow.async_configure(result["flow_id"], {CONF_URL: f"{URL}/"})


async def test_signing_in_with_a_code_and_choosing_lists_and_filters(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
):
    mock_server(aioclient_mock)
    result = await start_flow(hass, aioclient_mock)
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
    assert result["step_id"] == "choose"
    # Approved as an integration, there is no Inbox to offer.
    list_choices = result["data_schema"].schema[CONF_LISTS].config["options"]
    assert [choice["value"] for choice in list_choices] == ["l-family", "l-house"]

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_LISTS: ["l-family"], CONF_FILTERS: ["sf-ha"]}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"] == {CONF_URL: URL, CONF_TOKEN: "tok-ha"}
    assert result["options"] == {CONF_LISTS: ["l-family"], CONF_FILTERS: ["sf-ha"]}
    assert result["title"] == "yarukoto.local"


async def test_signed_in_as_a_person_the_inbox_is_a_choice(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker):
    mock_server(aioclient_mock, me=ME_PERSON)
    result = await start_flow(hass, aioclient_mock)
    aioclient_mock.post(f"{URL}/api/v1/pair/poll", json={"status": "approved", "token": "tok-me"})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    list_choices = result["data_schema"].schema[CONF_LISTS].config["options"]
    assert list_choices[0] == {"value": "inbox", "label": "Inbox"}


async def test_a_server_without_households_is_turned_away(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker):
    aioclient_mock.get(f"{URL}/api/v1/health", json={"ok": True, "features": ["taskReminders"]})
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {CONF_URL: URL})
    assert result["errors"] == {"base": "server_too_old"}


async def test_an_expired_code_is_replaced_with_a_new_one(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker):
    aioclient_mock.get(f"{URL}/api/v1/health", json=HEALTH)
    result = await start_flow(hass, aioclient_mock)

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


async def set_up(hass: HomeAssistant, lists: list[str], filters: list[str]) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="yarukoto.local",
        unique_id=URL,
        data={CONF_URL: URL, CONF_TOKEN: "tok-ha"},
        options={CONF_LISTS: lists, CONF_FILTERS: filters},
    )
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def items(hass: HomeAssistant, entity_id: str) -> list[dict]:
    response = await hass.services.async_call(
        TODO_DOMAIN, "get_items", {}, target={"entity_id": entity_id}, blocking=True, return_response=True
    )
    return response[entity_id]["items"]


async def test_lists_and_filters_are_todo_lists(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker):
    mock_server(aioclient_mock)
    await set_up(hass, ["l-family"], ["sf-ha"])

    family = hass.states.get("todo.yarukoto_local_family")
    assert family is not None and family.state == "1"
    milk = (await items(hass, family.entity_id))[0]
    assert milk["summary"] == "Buy milk"
    assert milk["due"] == "2026-10-02"

    tagged = hass.states.get("todo.yarukoto_local_tagged_ha")
    assert tagged is not None
    assert [item["summary"] for item in await items(hass, tagged.entity_id)] == ["Fix porch light"]
    # The token goes on every request.
    assert all(call[3]["Authorization"] == "Bearer tok-ha" for call in aioclient_mock.mock_calls)


async def test_adding_to_a_list_puts_it_there_and_edits_go_field_by_field(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
):
    mock_server(aioclient_mock)
    aioclient_mock.post(f"{URL}/api/v1/tasks", json={"task": MILK})
    aioclient_mock.patch(f"{URL}/api/v1/tasks/t-milk", json={"task": MILK})
    aioclient_mock.delete(f"{URL}/api/v1/tasks/t-milk", json={"task": MILK})
    await set_up(hass, ["l-family"], [])
    entity = "todo.yarukoto_local_family"

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


async def test_adding_to_the_inbox_files_it_nowhere(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker):
    mock_server(aioclient_mock, me=ME_PERSON)
    aioclient_mock.post(f"{URL}/api/v1/tasks", json={"task": MILK})
    await set_up(hass, ["inbox"], [])
    await hass.services.async_call(
        TODO_DOMAIN, "add_item", {"item": "Call the plumber"}, target={"entity_id": "todo.yarukoto_local_inbox"}, blocking=True
    )
    post = next(call for call in aioclient_mock.mock_calls if call[0] == "POST")
    assert post[2]["listId"] is None


async def test_a_filter_can_be_ticked_off_but_not_added_to(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker):
    mock_server(aioclient_mock)
    aioclient_mock.patch(f"{URL}/api/v1/tasks/t-lights", json={"task": LIGHTS})
    await set_up(hass, [], ["sf-ha"])
    entity = "todo.yarukoto_local_tagged_ha"

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(TODO_DOMAIN, "add_item", {"item": "Bread"}, target={"entity_id": entity}, blocking=True)
    await hass.services.async_call(
        TODO_DOMAIN, "update_item", {"item": "t-lights", "status": "completed"}, target={"entity_id": entity}, blocking=True
    )
    assert not any(call[0] == "POST" for call in aioclient_mock.mock_calls)
    assert any(call[0] == "PATCH" for call in aioclient_mock.mock_calls)


async def test_a_signed_out_integration_asks_to_sign_in_again(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker):
    aioclient_mock.get(f"{URL}/api/v1/filters/sf-ha/tasks", status=401, json={"error": "signed_out"})
    entry = await set_up(hass, [], ["sf-ha"])
    assert entry.state is config_entries.ConfigEntryState.SETUP_ERROR
    flows = hass.config_entries.flow.async_progress()
    assert [flow["context"]["source"] for flow in flows] == ["reauth"]
