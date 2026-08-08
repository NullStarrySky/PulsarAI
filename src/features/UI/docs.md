# UI

`UI` owns generic shell state and rendering rather than feature behavior.

`presentation/AppIcon.vue` is the shared application-identity image used by shell and feature surfaces. The conversation left sidebar shows it in the top brand header, with theme-aware framing around the monochrome source artwork.

`layout-store.ts` exposes `setTabStatus` and `setResourceTabStatus`. The top bar renders loading, success, warning and error states; Conversation uses the loading state during generation.

`presentation/ShellTopBar.vue` remains the native window chrome above feature-owned headers. It renders workspace tabs and desktop minimize/maximize/close controls; the focused conversation surface owns the settings entry in its own transparent draggable header. Both titlebars filter interactive descendants and call Tauri `startDragging()` only for a primary-button press on background space, avoiding overlapping native drag regions around buttons and popovers. Window handles are created only inside Tauri so the same shell remains testable in the pure Vite preview. The current focused conversation shell opens one non-closable conversation tab and keeps the existing tab store contract available for later workspace restoration.

常驻 Shell 顶栏、Composer 和资产卡使用不透明主题背景，不使用 `backdrop-filter`。原生窗口拖拽期间，根节点临时暂停动画和 transition、关闭滤镜与阴影，并把 `#app` 约束为单一 paint containment；拖拽结束后立即恢复。该状态只影响窗口移动时的合成成本，不改变窗口内部的滚动和编辑交互。

`presentation/AppShell.vue` mounts the database-backed conversation stage, Settings dialog, and shared command-search dialog. The stage header routes Search to the command palette and renders the database-backed Schedule page in a bounded dialog; it does not maintain separate mock search or schedule datasets.

Composer tool placement is owned by `domain/composer-toolbar.ts` and the appearance store. The normalized layout has `left`, `right`, and `unused` arrays, contains every known tool exactly once, and provides default placement for newly introduced tools.

The appearance store also persists arbitrary user CSS separately from imported
themes. It installs the value in `#pulsarai-custom-css` after theme styles so
ordinary selectors can be overridden without creating or selecting a theme.
The Appearance page imports themes through a modal CSS reader: a user may load
a `.css` file or paste and edit CSS before confirming the import. Composer
toolbar placement remains normalized store state but is not editable from the
settings page.

## Global search

`search/presentation/CommandSearchDialog.vue` composes feature-owned results. Commands, character packages, and conversations use their owning stores; plugin metadata comes from the Plugin store, while plugin paths, filenames, and content use the Plugin feature's SurrealDB-backed node search. Plugin resource results retain stable plugin/node IDs and open the matching node in its owning workspace page. Database searches are debounced and stale responses are ignored.

Shell sidebar widths are desktop-resizable, clamped to a shared minimum, and persisted by the layout store. The General settings page can optionally persist and restore the main window's open workspace tabs; subwindows never overwrite that snapshot. Application-owned scrolling regions use the shared shadcn-vue `ScrollArea` by default, whose wrapper mounts visible vertical and horizontal `ScrollBar` components so sidebars, settings, trees, and long panels share one scrollbar treatment; specialized editors and virtualizers keep ownership of their own viewport.

The focused conversation layout is conceptually split into flexible left and right regions around one `724px` middle column. The message scroller and composer stay inside that middle column; the asset card floats in the right region without changing the middle column or taking ownership of its scrollbar. Below 768px the middle region becomes full width and floating panels use the shared mobile fallback.

## Window lifecycle

`application/window-lifecycle-store.ts` owns the persisted main-window close
behavior: ask, exit, or keep running in the system tray. Only the main window
intercepts close requests; resource subwindows retain normal close semantics.
The ask flow can remember either concrete choice, while dismissing it leaves the
application open and keeps the ask preference.

The native tray is intentionally minimal. A left click restores, shows, and
focuses the main window. Its context menu contains only the explicit application
exit action. Mobile builds do not create a tray.
