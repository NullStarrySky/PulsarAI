# UI

`UI` owns generic shell state and rendering rather than feature behavior.

`components/AppIcon.vue` is the shared application-identity image used by feature surfaces such as About.

`layout-store.ts` owns only settings visibility and the transient immersive-conversation state. Resource selection remains in the focused Feature stores and surfaces; UI does not maintain workspace tabs, tab sessions, sidebar state, or resource registries.

`components/ShellTopBar.vue` remains the native window chrome above feature-owned headers. Its lighter card-colored surface provides back/forward controls, compact File/Edit/Settings/Help menus, and desktop minimize/maximize/close controls. Both titlebars filter interactive descendants and call Tauri `startDragging()` only for a primary-button press on background space, avoiding overlapping native drag regions around buttons and popovers. Window handles are created only inside Tauri so the same shell remains testable in the pure Vite preview.

`layout-store.ts` owns the transient `immersiveConversation` state. Entering it from the conversation header hides both titlebars; `ConversationStageOnePage.vue` renders one top-right floating restore button so the state always has an explicit exit path.

常驻 Shell 顶栏、Composer 和资产卡使用不透明主题背景，不使用 `backdrop-filter`。Shell 顶栏与非沉浸模式下的会话标题栏共享原生窗口拖拽；沉浸模式下改由消息列表的空白背景拖动，消息气泡、过程步骤和消息工具栏显式阻止拖拽。从最大化窗口开始拖动时先还原再继续移动。原生窗口拖拽期间，根节点临时暂停动画和 transition、关闭滤镜与阴影，并把 `#app` 约束为单一 paint containment；拖拽结束后立即恢复。该状态只影响窗口移动时的合成成本，不改变窗口内部的滚动和编辑交互。

`components/AppShell.vue` mounts the database-backed conversation stage, Settings dialog, and shared command-search dialog. The stage header routes Search to the command palette and renders the database-backed Schedule page in a bounded dialog; it does not maintain separate mock search or schedule datasets.

`components/SettingsDialog.vue` owns the settings shell rather than repeating shell concerns in each Feature page. The registry exposes one flat page list, keeps Hotkey first, and lets a page supply either one component or first-level functional tabs. The left header and content header are desktop drag handles; their `interact.js` drag intentionally has no viewport restriction, while the shared responsive state switches the dialog to a full-viewport, non-draggable layout with a navigation drawer below 768px. `SettingPage` owns only scrollable page content, and the shell owns the visible page title, tabs, search, and close action.

Composer tool placement is owned by `composer-toolbar.ts` and the appearance store. The normalized layout has `left`, `right`, and `unused` arrays, contains every known tool exactly once, and provides default placement for newly introduced tools. ModelSelect defaults to the right side; reasoning is part of its combined model reference, and neither a standalone reasoning tool nor a main-Plugin picker belongs to the toolbar catalog.

The appearance store also persists arbitrary user CSS separately from imported
themes. It installs the value in `#pulsarai-custom-css` after theme styles so
ordinary selectors can be overridden without creating or selecting a theme.
The Appearance page imports themes through a modal CSS reader: a user may load
a `.css` file or paste and edit CSS before confirming the import. Composer
toolbar placement remains normalized store state but is not editable from the
settings page. The page presents display mode as a segmented control and themes
as a compact option grid, while retaining custom CSS, font import and selection,
font size, UI scale, interactive-code-preview, and Android navigation controls.

## Global search

`search/CommandSearchDialog.vue` composes commands, character packages, and conversations from their owning stores. Selecting a package or conversation updates the focused conversation surface directly; the palette does not open resource tabs.

Application-owned scrolling regions use the shared shadcn-vue `ScrollArea` by default, whose wrapper mounts visible vertical and horizontal `ScrollBar` components so settings, trees, and long panels share one scrollbar treatment; specialized editors and virtualizers keep ownership of their own viewport.

The focused conversation layout is conceptually split into flexible left and right regions around one `724px` middle column. The message scroller and composer stay inside that middle column; the asset card floats in the right region without changing the middle column or taking ownership of its scrollbar. Below 768px the middle region becomes full width and floating panels use the shared mobile fallback.

## Window lifecycle

`window-lifecycle-store.ts` owns the persisted main-window close
behavior: ask, exit, or keep running in the system tray. Only the main window
intercepts close requests; resource subwindows retain normal close semantics.
The ask flow can remember either concrete choice, while dismissing it leaves the
application open and keeps the ask preference.

The native tray is intentionally minimal. A left click restores, shows, and
focuses the main window. Its context menu contains only the explicit application
exit action. Mobile builds do not create a tray.
