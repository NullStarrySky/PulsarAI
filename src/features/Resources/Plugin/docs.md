# Plugin Resources

`src/features/Resources/Plugin` owns plugin resource storage, priority resolution, and generation-time resource injection.

Plugins can be package-local or global. A non-null `packageId` owns a local plugin; `packageId: null` marks a global plugin managed from DefaultConfig. `builtIn` is reserved for immutable system plugins, which remain the final fallback. Plugins can be enabled, marked as main where local, and ordered.

Runtime ordering is centralized in `application/plugin-store.ts`:

1. package-local main plugins;
2. other package-local plugins by their own `order`;
3. external global plugins by the current package's `globalPluginOrder`, falling back to the global default `order`;
4. immutable system plugins.

`globalPluginOrder` stores only plugin ids on the character package. Opening a package removes deleted ids, removes duplicates, and appends newly available global plugins before persisting the normalized order. Deleting a global plugin therefore never leaves an executable stale reference.

DefaultConfig owns global plugin creation, JSON import, deletion, enable state, and default ordering. The character-package plugin sidebar separates `本地` and `内置`; dragging inside the global section changes only that package's `globalPluginOrder`.

When multiple enabled plugins provide the same resource container id, generation consumers use the first matching container from the fully resolved package order. The visual background resolver skips containers without an enabled background so the immutable built-in media remains a real fallback.

The built-in container ids are defined in `domain/plugin-types.ts`:

- `background`: media, single selection. Its content is `{ kind: "media", url, mediaType }`, where `mediaType` is `image` or `video`.
- `character`: markdown, multi selection.
- `context-structure`: markdown, single selection.
- `insertable`: markdown, multi selection. Insertable resources carry an explicit injection position, matching depth, and structured condition rows.
- `action`: JavaScript actions available from the conversation composer's `/` menu. Actions are multi-select resources and may use the same injection switch, position, depth, and condition system.
- `tool`: built-in Agent tool metadata. Implementations remain in the owning feature.
- `component`: component source, no selection controls.

The plugin workspace page is a normal workspace resource with `resourceType: "plugin"`. It owns the description, resource, and generation-process tabs. Markdown plugin descriptions and markdown resource content use the existing Milkdown/Crepe editor path instead of split preview/edit panes. Media resources use a dedicated image/video preview, media-type selector, and URL field instead of exposing their storage JSON. Clicking a resource opens only its content editor; resource metadata, name, icon, description, and template state are edited from the resource row menu. Container attributes are edited from the container row menu.

Insertable resource rows expose one compact `注入` badge. Its popover owns the injection switch, `insertPosition`, a 1-20 `insertDepth` slider, and structured `insertCondition` rows. Each condition stores a stable id, a function name, and an argument array. Older string conditions are normalized to `custom` rows when plugins load.

The conversation workspace consumes plugin resources at these integration points:

- The active background is resolved from the first enabled media resource in package priority order. Images render as a cover layer and videos render as muted, looping, inline background video.
- The composer toolbar exposes `PluginResourceMenu.vue`, a compact plugin -> container -> resource control menu for enabling resources and toggling insertion.
- `application/plugin-generation-environment.ts` scans enabled plugins in priority order. The first plugin providing a container owns that container's selected values for the run.
- Every resource marked as inserted is condition-checked against a per-resource environment. The environment merges the normal active-path values with `depth`, `containKeyWord`, `excludeKeyWord`, `probability`, `math`, and `Math`.
- `containKeyWord` and `excludeKeyWord` inspect only the most recent `insertDepth` messages. Their argument may be literal text or JavaScript regex notation such as `/chapter\\s+\\d+/i`. `probability` accepts a percentage from 0 to 100. `custom` executes its argument through the existing Sandbox, so expressions such as `math.random() > 0.3` can also access the normal path environment.
- Structured conditions use AND semantics. An unknown function, invalid custom expression, or falsy result rejects the resource and records a diagnostic.
- Passing resources are injected at `insertPosition`; legacy metadata keys `位置`, `position`, and `insertPosition` remain read-compatible. Repeated positions become ordered arrays.
- Enabled action resources are collected across the resolved plugin order and de-duplicated by command name, so a higher-priority local action can override a global or built-in action with the same name.
- Invoking an action always adds its command name and remaining composer text to the path environment as `{ action, prompt }`. If the selected action is marked inserted and its conditions pass, its JavaScript content temporarily replaces the plugin generation process for that run. The resource may still use `insertPosition` like any other inserted resource.
- Markdown resources stringify to markdown. Interactive-document-shaped content is wrapped with `InteractiveDocument`, so macro expansion sees its compiled markdown while process code can still inspect the resource metadata and original content.
- The first enabled plugin with a non-empty `generationProcess` controls the run. Empty processes inherit the default conversation agent.

The old built-in plugin center page is removed. Plugin UI is resource-oriented and lives under this feature rather than under `src/features/UI/builtin`.

The immutable core plugin ships `assets/builtin-classroom-background.png` as its enabled fallback background. `loadInitialData` upgrades older persisted copies of the built-in plugin so the media container schema and classroom resource are available without resetting user plugins.

The same core plugin ships an enabled, inserted `/getTime` action. Its script returns the current local time with `modelName: "action:getTime"` and never calls the default Agent.

The core plugin also owns a fixed `tool` container describing the built-in `executeJavaScript` Agent tool and an inserted `Feature API 文档` resource at `API_DOCUMENTATION`. The document resource contains `{{CAPABILITIES_PROMPT}}`; its text is generated by `Capabilities`, not copied into the plugin.
