# Plugin Files

`src/features/Resources/Plugin` owns plugin storage, package-aware priority, the file workspace, and generation-time injection.

Plugins can be package-local or global. A non-null `packageId` owns a local plugin; `packageId: null` marks a global plugin managed from DefaultConfig. `builtIn` is reserved for immutable system plugins and always sorts last. Local main plugins sort first. Character packages persist only their local ordering of external global plugins in `globalPluginOrder`; opening a package removes stale ids and appends newly available globals.

## File model

Each plugin owns one serializable `root` folder. Folders are plain, nestable nodes. Files and folders share the same injection fields:

- `id`, `name`, and optional `icon`;
- `inserted` and `insertPosition`;
- structured `insertCondition` rows and their message matching depth;
- structural `order`.

Files additionally store `content`; folders store `children`. There is no resource enable state and no persisted resource type. `domain/plugin-types.ts` derives the editor and runtime type from the filename:

- `.md` and `.markdown`: Markdown through Milkdown/Crepe;
- `.imd`: InteractiveDocument JSON;
- `.js`, `.mjs`, `.cjs`, `.ts`: JavaScript;
- `.json`: JSON;
- common image and video suffixes: media;
- `.vue`, `.jsx`, `.tsx`: component source;
- everything else: plain text.

The root `info.md` is the plugin documentation and opens by default. A root `generation.js` supplies the plugin generation process when it is non-empty. A root `context.imd` is seeded as an injected `CONTEXT_STRUCTURE` file. `action/` contains JavaScript conversation actions, and `background/` contains media backgrounds. These are path conventions, not special container types; users can create and nest ordinary folders elsewhere.

The immutable core plugin is recreated from the current conventions at startup. Because the file-tree format has not shipped, legacy container records are intentionally not migrated.

## Workspace

`presentation/PluginWorkspacePage.vue` is a normal `resourceType: "plugin"` workspace. It uses a restrained two-pane file layout:

- the left pane owns search, create-file, create-folder, import, nesting, collapse, selection, and drag-to-move;
- create-file menus offer `AGENTS.md`, Markdown, IMD, JavaScript, JSON, media, component, and plain-text templates instead of assuming `.md`;
- operating-system file drops use both browser `File` payloads and Tauri webview drag events; native path reads fall back cleanly when the filesystem scope rejects a path;
- clicking a folder only expands or collapses it. Files and folders expose injection from their tree-row action instead of opening a folder page;
- the selected row is highlighted across its full width;
- the right pane edits the filename and content, with a separate compact property strip for id/path/icon;
- the injection popover is separate from content and works for both files and folders;
- system plugin files are readable but immutable.

On layouts below 768px the shared responsive store switches the workspace between the tree and editor, with an explicit back control. Markdown uses block editing without AI or top-bar features. IMD opens the single-column InteractiveDocument editor, JavaScript and JSON use CodeMirror, and media files use URL/data content plus an image or video preview.

## Runtime

`application/plugin-generation-environment.ts` scans enabled plugins in resolved priority order:

1. It creates the active-path Sandbox environment.
2. It resolves the first non-empty root `generation.js`.
3. Every injected node is condition-checked.
4. An injected file contributes one value at `insertPosition`.
5. An injected folder contributes an ordered array of condition-passing descendant files.
6. Repeated positions retain plugin and tree order.

Conditions use AND semantics. `containKeyWord`, `excludeKeyWord`, `probability`, and `custom` keep their existing Sandbox behavior. Failures reject only that node and add a diagnostic.

`CONTEXT_STRUCTURE` selects the first passing file as the context template. The seeded `context.imd` compiles role-aware blocks to context headings. An invoked file under `action/` can replace the generation process for that run when it is injected and its conditions pass. The first injected media descendant under `background/` in plugin priority order becomes the conversation background.

Interactive-document-shaped file content is wrapped by `InteractiveDocument`, so its generated value stringifies to compiled Markdown while scripts can still inspect the original serializable content.

The old composer plugin/resource selector has been removed. File injection is managed in the plugin workspace rather than duplicated in the conversation input toolbar.
