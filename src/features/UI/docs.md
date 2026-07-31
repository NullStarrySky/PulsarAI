# UI

`UI` owns generic shell state and rendering rather than feature behavior.

`layout-store.ts` exposes `setTabStatus` and `setResourceTabStatus`. The top bar renders loading, success, warning and error states; Conversation uses the loading state during generation.

Composer tool placement is owned by `domain/composer-toolbar.ts` and the appearance store. The normalized layout has `left`, `right`, and `unused` arrays, contains every known tool exactly once, and provides default placement for newly introduced tools.

The appearance store also persists arbitrary user CSS separately from imported
themes. It installs the value in `#pulsarai-custom-css` after theme styles so
ordinary selectors can be overridden without creating or selecting a theme.

## Window lifecycle

`application/window-lifecycle-store.ts` owns the persisted main-window close
behavior: ask, exit, or keep running in the system tray. Only the main window
intercepts close requests; resource subwindows retain normal close semantics.
The ask flow can remember either concrete choice, while dismissing it leaves the
application open and keeps the ask preference.

The native tray is intentionally minimal. A left click restores, shows, and
focuses the main window. Its context menu contains only the explicit application
exit action. Mobile builds do not create a tray.
