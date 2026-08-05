# UI

`UI` owns generic shell state and rendering rather than feature behavior.

`presentation/AppIcon.vue` is the shared application-identity image used by shell and feature surfaces. The conversation left sidebar shows it in the top brand header, with theme-aware framing around the monochrome source artwork.

`layout-store.ts` exposes `setTabStatus` and `setResourceTabStatus`. The top bar renders loading, success, warning and error states; Conversation uses the loading state during generation.

Composer tool placement is owned by `domain/composer-toolbar.ts` and the appearance store. The normalized layout has `left`, `right`, and `unused` arrays, contains every known tool exactly once, and provides default placement for newly introduced tools.

The appearance store also persists arbitrary user CSS separately from imported
themes. It installs the value in `#pulsarai-custom-css` after theme styles so
ordinary selectors can be overridden without creating or selecting a theme.

## Global search

`search/presentation/CommandSearchDialog.vue` composes feature-owned results. Commands, character packages, and conversations use their owning stores; plugin metadata comes from the Plugin store, while plugin paths, filenames, and content use the Plugin feature's SurrealDB-backed node search. Plugin resource results retain stable plugin/node IDs and open the matching node in its owning workspace page. Database searches are debounced and stale responses are ignored.

Shell sidebar widths are desktop-resizable, clamped to a shared minimum, and persisted by the layout store. The General settings page can optionally persist and restore the main window's open workspace tabs; subwindows never overwrite that snapshot. Application-owned scrolling regions use the shared shadcn-vue `ScrollArea` by default, whose wrapper mounts visible vertical and horizontal `ScrollBar` components so sidebars, settings, trees, and long panels share one scrollbar treatment; specialized editors and virtualizers keep ownership of their own viewport.

The conversation right sidebar hosts Conversation, Task, and Plugin tabs. The Plugin feature supplies the third tab's contents, including the package-local folder tree and activation control. The conversation left sidebar remains package navigation and generic application entry points only.

## Window lifecycle

`application/window-lifecycle-store.ts` owns the persisted main-window close
behavior: ask, exit, or keep running in the system tray. Only the main window
intercepts close requests; resource subwindows retain normal close semantics.
The ask flow can remember either concrete choice, while dismissing it leaves the
application open and keeps the ask preference.

The native tray is intentionally minimal. A left click restores, shows, and
focuses the main window. Its context menu contains only the explicit application
exit action. Mobile builds do not create a tray.
