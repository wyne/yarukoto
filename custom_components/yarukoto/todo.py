"""Home Assistant to-do lists for chosen Yarukoto lists and saved filters."""

from __future__ import annotations

from typing import Any

from homeassistant.components.todo import (
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import dt as dt_util

from . import YarukotoConfigEntry
from .api import INBOX, YarukotoError, due_fields, task_due
from .const import CONF_FILTERS, CONF_LISTS, DOMAIN
from .coordinator import Snapshot, YarukotoCoordinator

EDIT_FEATURES = (
    TodoListEntityFeature.UPDATE_TODO_ITEM
    | TodoListEntityFeature.DELETE_TODO_ITEM
    | TodoListEntityFeature.SET_DUE_DATE_ON_ITEM
    | TodoListEntityFeature.SET_DUE_DATETIME_ON_ITEM
    | TodoListEntityFeature.SET_DESCRIPTION_ON_ITEM
)


async def async_setup_entry(
    hass: HomeAssistant, entry: YarukotoConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator = entry.runtime_data
    async_add_entities(
        [YarukotoListTodo(coordinator, entry, list_id) for list_id in entry.options.get(CONF_LISTS, [])]
        + [YarukotoFilterTodo(coordinator, entry, filter_id) for filter_id in entry.options.get(CONF_FILTERS, [])]
    )


class YarukotoTodo(CoordinatorEntity[YarukotoCoordinator], TodoListEntity):
    """Shared by both kinds: showing, ticking off, editing and deleting tasks."""

    _attr_has_entity_name = True
    _attr_supported_features = EDIT_FEATURES

    def __init__(self, coordinator: YarukotoCoordinator, entry: YarukotoConfigEntry, key: str, unique: str) -> None:
        super().__init__(coordinator)
        self._key = key
        self._attr_unique_id = f"{entry.entry_id}_{unique}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.title,
            manufacturer="Yarukoto",
            entry_type=DeviceEntryType.SERVICE,
            configuration_url=coordinator.api.url,
        )
        self._update_from_snapshot()

    def _snapshot(self) -> Snapshot | None:
        raise NotImplementedError

    @property
    def available(self) -> bool:
        return super().available and self._snapshot() is not None

    @callback
    def _handle_coordinator_update(self) -> None:
        self._update_from_snapshot()
        super()._handle_coordinator_update()

    def _update_from_snapshot(self) -> None:
        snapshot = self._snapshot()
        if snapshot is None:
            return
        self._attr_name = snapshot.name
        zone = dt_util.get_default_time_zone()
        self._attr_todo_items = [
            TodoItem(
                uid=task["id"],
                summary=task["title"],
                status=TodoItemStatus.COMPLETED if task.get("completed") else TodoItemStatus.NEEDS_ACTION,
                due=task_due(task, zone),
                description=task.get("notes") or None,
            )
            for task in snapshot.tasks
        ]

    async def async_update_todo_item(self, item: TodoItem) -> None:
        fields: dict[str, Any] = {
            "title": item.summary or "",
            "completed": item.status == TodoItemStatus.COMPLETED,
            **_item_fields(item),
        }
        await self._write(self.coordinator.api.update_task(item.uid, fields))

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        for uid in uids:
            # Deleting moves a task to the app's trash, where it can be restored.
            await self._write(self.coordinator.api.delete_task(uid), refresh=False)
        await self.coordinator.async_request_refresh()

    async def _write(self, call: Any, refresh: bool = True) -> None:
        try:
            await call
        except YarukotoError as err:
            raise HomeAssistantError(str(err)) from err
        if refresh:
            await self.coordinator.async_request_refresh()


class YarukotoListTodo(YarukotoTodo):
    """One Yarukoto list. Anything added here goes into that list, so it always shows."""

    _attr_supported_features = EDIT_FEATURES | TodoListEntityFeature.CREATE_TODO_ITEM

    def __init__(self, coordinator: YarukotoCoordinator, entry: YarukotoConfigEntry, list_id: str) -> None:
        super().__init__(coordinator, entry, list_id, f"list_{list_id}")

    def _snapshot(self) -> Snapshot | None:
        return (self.coordinator.data.lists if self.coordinator.data else {}).get(self._key)

    async def async_create_todo_item(self, item: TodoItem) -> None:
        fields: dict[str, Any] = {
            "title": item.summary or "",
            # The task API spells the Inbox as no list at all.
            "listId": None if self._key == INBOX else self._key,
            **_item_fields(item),
        }
        await self._write(self.coordinator.api.create_task(fields))


class YarukotoFilterTodo(YarukotoTodo):
    """
    The tasks a saved filter admits, as the app shows them.

    Nothing can be added here: a filter can span lists and match on tags or
    dates, so there's no one place a new item could go and be sure to show up.
    Add to one of the lists instead.
    """

    def __init__(self, coordinator: YarukotoCoordinator, entry: YarukotoConfigEntry, filter_id: str) -> None:
        # Unprefixed, as the first version of this integration named them.
        super().__init__(coordinator, entry, filter_id, filter_id)

    def _snapshot(self) -> Snapshot | None:
        return (self.coordinator.data.filters if self.coordinator.data else {}).get(self._key)


def _item_fields(item: TodoItem) -> dict[str, Any]:
    return {"notes": item.description or "", **due_fields(item.due, dt_util.get_default_time_zone())}
