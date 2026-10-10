// Runs in the page before the app does, on every load.

// The exported web client also runs in ordinary browsers. Mark this host before
// React starts so desktop-only features — installer updates, in particular —
// do not appear in those browser builds.
window.__YARUKOTO_WINDOWS_APP__ = true;
//
// WebView2's own right-click menu is a browser's: Back, Refresh, Save as,
// Print, Inspect. The app draws its own menus where a right-click means
// something, so this only has to stop the browser's from appearing everywhere
// else. Text fields and selected text keep it, since Cut, Copy and Paste are
// what a right-click is for there.
document.addEventListener('contextmenu', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const editable = target && target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');
  const selection = window.getSelection();
  if (editable || (selection && !selection.isCollapsed)) return;
  event.preventDefault();
});
