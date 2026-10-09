# dmgbuild settings for the Mac download, used by release-mac.sh:
#
#   dmgbuild -s scripts/dmg-settings.py -D app=<path to .app> \
#     -D background=assets/dmg/background.png <volume name> <out.dmg>
#
# dmgbuild writes the Finder window layout (.DS_Store) directly, so it needs no
# Finder or AppleScript and works on a headless CI runner. The background and
# the icon positions below are designed together; see assets/dmg/background.html.
import os.path

app = defines["app"]  # noqa: F821 (dmgbuild provides `defines`)
app_name = os.path.basename(app)

format = "UDZO"
files = [app]
symlinks = {"Applications": "/Applications"}
hide_extensions = [app_name]

# background@2x.png beside it is picked up for Retina screens.
background = defines["background"]  # noqa: F821

window_rect = ((200, 120), (640, 428))
default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False

icon_size = 128
text_size = 13
icon_locations = {
    app_name: (160, 175),
    "Applications": (480, 175),
}
