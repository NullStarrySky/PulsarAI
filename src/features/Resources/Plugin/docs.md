# Plugin Files

`src/features/Resources/Plugin` owns plugin storage, package-aware priority, the file workspace, container declarations, and explicit cross-resource resolution.

The Plugin capability inventory is defined in `domain/plugin-capability.ts` and re-exported by `capabilities.ts`. This lets the normal Capability runtime, VitePress, and the project-Agent prompt consume the same API signatures without importing Plugin stores into the Agent prompt module.

Plugins can be package-local or global. A non-null `packageId` owns a local plugin; `packageId: null` marks a global plugin managed from DefaultConfig. `builtIn` marks a system plugin with a restorable default snapshot; its tree remains editable. Local main plugins sort first, external global plugins follow the active package order, and built-in global fallbacks remain last.

Plugin test chats are not plugin-tree files. Conversation owns them as `kind: "test"` records with a resource binding and `pluginId`; the right-sidebar Task panel creates and manages them. A local plugin uses its owning package as the execution package, while a global plugin requires the user to choose an existing package. The bound plugin is included for that test run even when it is otherwise disabled, and deleting the plugin removes its associated test conversations.

## File model

Each plugin owns one serializable nested `root` folder. Tree nodes persist `id`, `name`, `icon`, and structural `order`; files additionally store `content`, container `memberships` metadata, and an independent numeric `priority` (default `100`), while folders store `children`.

File behavior comes from the suffix:

- `.md` and `.markdown`: Markdown through Milkdown/Crepe;
- `.imd`: SFC-style InteractiveDocument source;
- `.js`, `.mjs`, `.cjs`, `.ts`: JavaScript;
- `.json`: JSON;
- common image and video suffixes: media;
- `.vue`: component source with template preview;
- `.jsx`, `.tsx`: component source;
- everything else: plain text.

Root `info.md` documents a plugin. Root `manifest.json` is reserved and currently stays `{}`; runtime conventions do not read configuration from it yet. Root `containers.xml` owns all container declarations and namespaced references. Root `regex.json` owns ordered message post-processing rules. Root `context.imd` is the role-aware context entry. Root `agentprocess/index.js` is the generation-process entry. Immediate `tools/<name>/tool.js + prompt.md` pairs define CodeAct-callable custom functions and their model-facing documentation. Root `Override.vue` replaces the default conversation content renderer, and `components/` owns reusable plugin Vue components. `action/` provides JavaScript process commands and Markdown composer-template commands, while `background/` provides media candidates.

`agentprocess/` contains process steps such as `step1-prepare.js`, `step2-generate.js`, and `step3-finalize.js`. `index.js` explicitly references and runs them with `api.runProcess(<@path:...>, environmentOverrides?)`. Only explicitly referenced JavaScript resource values are accepted, and recursive process cycles are rejected.

## Explicit references

Plugin files are never flattened into the Sandbox environment. All cross-resource access uses one explicit syntax family:

- `<@local:name>` reads IMD `sub_data`;
- `<@path:./relative.md>` reads a file relative to the current resource;
- `<@id:resource-id>` reads a visible resource by stable ID;
- `<@容器名称>` resolves a uniquely visible container by name;
- `<@container:root/name>`, `<@container:plugin/name>`, or `<@container:global/name>` selects an explicit scope when a short name would be ambiguous.

Outside a macro, a resource reference renders through its normal string representation. Inside `{{...}}` or `[[...]]`, the compiler replaces the token with a guarded `ref(...)` slot. User-written dynamic `ref(dynamicString)` cannot introduce undeclared dependencies.

Markdown and IMD prompt editors register `<@...>` as a Milkdown remark/schema/input-rule extension. A ProseMirror decoration also highlights newly typed plain-text tokens, while serialization keeps the literal reference source unchanged.

## Containers

Every plugin owns one fixed UTF-8 root `containers.xml`:

```xml
<containers>
  <container name="角色上下文" scope="plugin">
    <description>角色身份、表达方式与持续对话所需的上下文。</description>
    <include as="base">container:global/基础上下文</include>
  </container>
</containers>
```

`description` is optional metadata. It is not a member value and is never injected into generation automatically. The IMD `<@...>` completion menu displays it together with the container name, scope, and owning plugin.

Member resources store `{ container, alias }` rows in `PluginFile.memberships`. Membership is authoring metadata and never appears in file content or Markdown rendering.

Because the definition file is at plugin root, `scope="root"` is visible to root-level resources only. `plugin` is visible within the owning plugin, and `global` is visible across the enabled plugin set. Scope controls lookup and never performs automatic injection.

A resolved container is a lazy namespace:

- `get(alias)` returns one member resource;
- `use(alias)` returns an imported container;
- `list()` returns declared resource and container aliases.

Referenced containers remain namespaced. Duplicate declarations, duplicate aliases, missing targets, plugin-root path escapes, and recursive render cycles produce diagnostics instead of last-write-wins behavior.

Container membership insertion is sorted by file priority from high to low. Equal priorities preserve the enabled-plugin and tree scan order. This ordering also determines which member wins first when duplicate aliases produce a diagnostic.

The shared resolver also exposes container inspection data to both the workspace and the Plugin capability:

- `plugin.listContainers()` returns each active container's query ID, definition-file ID/path, source plugin, description, direct-use count, and content count;
- `plugin.getContainer(containerId)` returns direct documents that reference the container and the resolved member contents;
- every returned document or content row includes its resource `id`, plugin-local `path`, type, priority, and source plugin so an Agent can continue with `plugin.getTree(...)`, explicit `<@id:...>` references, or the current plugin's `plugin.read(path)`.
- plugin-process-only CRUD uses `createContainer`, `updateContainer`, and `removeContainer`; content membership uses `addContainerContent`, `updateContainerContent`, and `removeContainerContent`, while keeping declarations in `containers.xml` and membership rows on files.

## Workspace

`presentation/PluginWorkspacePage.vue` keeps the two-pane tree/editor workflow:

- search, create/import, native and browser file drop, nesting, collapse, and drag move remain in the left tree;
- the desktop file tree can collapse completely from the selected-file bar, while the mobile layout continues to switch between full tree and full editor views;
- plugin identity and plugin-level actions stay in the owning plugin list instead of consuming a second workspace header;
- the selected file owns name/path/id/icon and content editing;
- the selected file properties expose priority through minus, value, and plus controls;
- root `containers.xml` uses a compact filename-selected structured editor for container names, scopes, one-line descriptions, and namespaced references; each container's details show direct-use documents and resolved contents with counts, source plugins, priorities, and file navigation; the convention file cannot be renamed, moved, or deleted;
- root `regex.json` uses a filename-selected structured editor for find/replace expressions, message range, one-based depth bounds, rule order, and `applyOnRending`;
- root `manifest.json` uses a filename-selected reserved configuration editor with JSON validation and currently stays `{}`;
- root `Override.vue` and ordinary `.vue` files switch between source and template preview; preview registers template-only components from `components/` and does not execute `<script>`;
- root `manifest.json`, `containers.xml`, `regex.json`, `Override.vue`, `components/`, and `tools/` cannot be renamed, moved, or deleted;
- Markdown source mode highlights `<@...>`, `{{...}}`, and `[[...]]`, and completes references and common macros; preview uses a centered Notion-like document surface. IMD reference editing also offers visible-container and local-data completions with descriptions, keyboard selection, and scoped insertion for ambiguous names;
- IMD exposes structured template/data editing, raw SFC source, and compiled message preview;
- JavaScript and JSON use code-oriented editing;
- media files provide direct image or video preview;
- built-in files are editable, while the plugin header offers a full restore-to-default action.

Below 768px the shared responsive store switches explicitly between tree and editor.

The VitePress Plugin guide registers `PluginApiReference.vue`. Its human view renders the complete shared Plugin capability definition, including types, scope notes, query APIs, tree APIs, and Container CRUD. Its send-preview view renders the exact Plugin API prompt produced for the model instead of maintaining a second handwritten inventory. Placeholder SVGs mark the document-graph, container-details, and CodeAct screenshots that can be replaced later.

## Runtime

`application/plugin-reference-resolver.ts` indexes enabled plugin files without evaluating them. It reads declarations only from each root `containers.xml`, reads memberships from file metadata, then resolves resources only when an entry document or JavaScript process explicitly references them. Rendering is cached per resolution task and records a dependency trace.

Normalization preserves the stored tree shape. It does not move declarations, create convention files, or translate another process entry. Container declarations are parsed only from root `containers.xml`; plugin generation discovers only root `agentprocess/index.js`.

Enabled root `regex.json` files form one conventional regex container. Files are sorted by descending file priority and then normal enabled-plugin/tree order. Generation applies every valid rule after the final role-preserving context message list is assembled; conversation and task-panel rendering applies only rules whose persisted field is exactly `applyOnRending: true`. Rendering never rewrites the stored message.

Immediate subfolders of root `tools/` form the custom-tool containers. A tool is active only when the same folder contains exact `tool.js` and `prompt.md` files. Newly created convention files receive global `自定义工具` / `自定义工具文档` memberships for inspection, while runtime discovery remains based on the exact path convention. `prompt.md` is resolved through the normal reference resolver and emitted in one `# 自定义工具` system message with function/prompt IDs and paths. `tool.js` must evaluate to one function; it executes in the authorized Sandbox with a source-plugin-scoped Plugin API and is exposed at `ctx.tools[name]`. Priority and collision handling never use last-write-wins.

`application/plugin-generation-environment.ts` supplies:

1. the authorized base API and active conversation values;
2. the reference resolver;
3. the first root `context.imd`;
4. the first non-empty root `agentprocess/index.js`;
5. the selected action process, if any.

Conversation compiles `context.imd` directly to role-preserving messages. The selected action or process entry is preprocessed with its source-scoped `ref` function and executed against the same minimal runtime environment.

JavaScript supports guarded explicit `<@...>` references. JavaScript source is not passed through text macro expansion, so `{{...}}` and `[[...]]` are not evaluated inside `.js` files. Referenced Markdown, text, component, or IMD resources still apply their own renderer and macro behavior when converted to a string.

`Agent/application/default-agent.ts` exposes exactly one AI SDK tool, `codeAct`. Its input must be one JavaScript function with an explicit `return`. `Agent/application/code-act.ts` validates that shape and executes it against the already-authorized Sandbox environment. The model receives `{ ok: true, value }` or `{ ok: false, error }`; Feature APIs, Plugin APIs, ask-user interaction, and Skill/MCP extensions remain ordinary functions in that environment rather than separate model tools.

Plugin custom tools follow the same rule: they are functions inside `ctx.tools`, not model-visible AI SDK tools. The model learns their contract from the generated custom-tool documentation block and calls them inside CodeAct.

The restorable global core plugin supplies fallback context, a global base container, actions, background media, and the visible default Agent workflow. Project-aware task context is assembled by the Agent and Conversation features rather than by a package-local system plugin.
