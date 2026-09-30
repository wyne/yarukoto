"""One Home Assistant to-do list per chosen saved filter."""

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
from .api import YarukotoError, due_fields, list_for_new_items, task_due
from .const import CONF_DEFAULT_LIST, CONF_FILTERS, DOMAIN
from .coordinator import YarukotoCoordinator


async def async_setup_entry(
    hass: HomeAssistant, entry: YarukotoConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator = entry.runtime_data
    async_add_entities(
        YarukotoTodoList(coordinator, entry, filter_id) for filter_id in entry.options.get(CONF_FILTERS, [])
    )


class YarukotoTodoList(CoordinatorEntity[YarukotoCoordinator], TodoListEntity):
    """The tasks one saved filter admits, as the app would show them."""

    _attr_has_entity_name = True
    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
        | TodoListEntityFeature.SET_DUE_DATE_ON_ITEM
        | TodoListEntityFeature.SET_DUE_DATETIME_ON_ITEM
        | TodoListEntityFeature.SET_DESCRIPTION_ON_ITEM
    )

    def __init__(self, coordinator: YarukotoCoordinator, entry: YarukotoConfigEntry, filter_id: str) -> None:
        super().__init__(coordinator)
        self._entry = entry
        self._filter_id = filter_id
        self._attr_unique_id = f"{entry.entry_id}_{filter_id}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.title,
            manufacturer="Yarukoto",
            entry_type=DeviceEntryType.SERVICE,
            configuration_url=coordinator.api.url,
        )
        self._update_from_snapshot()

    @property
    def available(self) -> bool:
        return super().available and self._filter_id in (self.coordinator.data or {})

    @callback
    def _handle_coordinator_update(self) -> None:
        self._update_from_snapshot()
        super()._handle_coordinator_update()

    def _update_from_snapshot(self) -> None:
        snapshot = (self.coordinator.data or {}).get(self._filter_id)
        if snapshot is None:
            return
        self._attr_name = snapshot.filter["name"]
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

    async def async_create_todo_item(self, item: TodoItem) -> None:
        snapshot = self.coordinator.data.get(self._filter_id)
        list_id = list_for_new_items(
            snapshot.filter.get("criteria", {}) if snapshot else {}, self._entry.options.get(CONF_DEFAULT_LIST)
        )
        if not list_id:
            raise HomeAssistantError(
                "This filter covers more than one list. Choose a list for new items in the Yarukoto integration's options."
            )
        fields: dict[str, Any] = {"title": item.summary or "", "listId": list_id, **self._item_fields(item)}
        await self._write(self.coordinator.api.create_task(fields))

    async def async_update_todo_item(self, item: TodoItem) -> None:
        fields: dict[str, Any] = {
            "title": item.summary or "",
            "completed": item.status == TodoItemStatus.COMPLETED,
            **self._item_fields(item),
        }
        await self._write(self.coordinator.api.update_task(item.uid, fields))

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        for uid in uids:
            # Deleting moves a task to the app's trash, where it can be restored.
            await self._write(self.coordinator.api.delete_task(uid), refresh=False)
        await self.coordinator.async_request_refresh()

    @staticmethod
    def _item_fields(item: TodoItem) -> dict[str, Any]:
        return {"notes": item.description or "", **due_fields(item.due, dt_util.get_default_time_zone())}

    async def _write(self, call: Any, refresh: bool = True) -> None:
        try:
            await call
        except YarukotoError as err:
            raise HomeAssistantError(str(err)) from err
        if refresh:
            await self.coordinator.async_request_refresh()
