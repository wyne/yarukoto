"""Constants for the Yarukoto integration."""

from datetime import timedelta

DOMAIN = "yarukoto"

CONF_FILTERS = "filters"
"""Saved filter ids shown as to-do lists."""

CONF_DEFAULT_LIST = "default_list"
"""Where a new item goes when its filter doesn't name exactly one list."""

SCAN_INTERVAL = timedelta(seconds=30)

DEVICE_NAME = "Home Assistant"
"""How this integration appears in the app's list of signed-in devices."""
