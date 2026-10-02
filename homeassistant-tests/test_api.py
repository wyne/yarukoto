from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from custom_components.yarukoto.api import due_fields, task_due

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
