from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from custom_components.yarukoto.api import due_fields, list_for_new_items, task_due

LA = ZoneInfo("America/Los_Angeles")


def test_a_task_due_on_a_day_is_a_date_and_one_with_a_time_is_local():
    assert task_due({"dueDate": "2026-10-02"}, LA) == date(2026, 10, 2)
    assert task_due({"dueDate": "2026-10-02", "dueTime": "18:30"}, LA) == datetime(2026, 10, 2, 18, 30, tzinfo=LA)
    assert task_due({}, LA) is None


def test_a_due_time_from_another_zone_is_written_in_the_household_zone():
    utc_evening = datetime(2026, 10, 3, 1, 30, tzinfo=timezone.utc)
    assert due_fields(utc_evening, LA) == {"dueDate": "2026-10-02", "dueTime": "18:30"}
    assert due_fields(date(2026, 10, 2), LA) == {"dueDate": "2026-10-02", "dueTime": None}
    assert due_fields(None, LA) == {"dueDate": None, "dueTime": None}
    naive = datetime(2026, 10, 2, 9, 5)
    assert due_fields(naive, LA)["dueTime"] == "09:05"
    assert due_fields(datetime(2026, 10, 2, 9, 5, tzinfo=timezone(timedelta(hours=-7))), LA)["dueTime"] == "09:05"


def test_new_items_go_to_the_one_list_a_filter_names_or_else_the_default():
    assert list_for_new_items({"listIds": ["l-groceries"], "folderIds": []}, "l-family") == "l-groceries"
    assert list_for_new_items({"listIds": ["l-a", "l-b"]}, "l-family") == "l-family"
    assert list_for_new_items({"listIds": [], "due": ["today"]}, None) is None
    # The Inbox is private to one person, so an integration can't add to it.
    assert list_for_new_items({"listIds": ["__inbox"]}, "l-family") == "l-family"
    # A folder widens the filter past its one list.
    assert list_for_new_items({"listIds": ["l-a"], "folderIds": ["f-home"]}, None) is None
