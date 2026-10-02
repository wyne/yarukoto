"""Constants for the Yarukoto integration."""

from datetime import timedelta

DOMAIN = "yarukoto"

CONF_LISTS = "lists"
"""Yarukoto lists shown as to-do lists. Adding an item puts it in that list."""

CONF_FILTERS = "filters"
"""Saved filters shown as to-do lists. Items can be ticked off and edited, not added."""

SCAN_INTERVAL = timedelta(seconds=30)

DEVICE_NAME = "Home Assistant"
"""How this integration appears in the app's list of signed-in devices."""
