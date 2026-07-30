# Plugin Files

`src/features/Resources/Plugin` owns plugin storage, package-aware priority, the file workspace, container declarations, and explicit cross-resource resolution.

Plugins can be package-local or global. A non-null `packageId` owns a local plugin; `packageId: null` marks a global plugin managed from DefaultConfig. `builtIn` reserves immutable system plugins. Local main plugins sort first, external global plugins follow the active package order, and immutable global fallbacks remain last.

## File model

Each plugin owns one serializable nested `root` folder. Tree nodes persist `id`, `name`, `icon`, and structural `order`; files additionally store `content`, while folders store `children`.

File behavior comes from the suffix:

- `.md` and `.markdown`: Markdown through Milkdown/Crepe;
- `.imd`: SFC-style InteractiveDocument source;
- `.js`, `.mjs`, `.cjs`, `.ts`: JavaScript;
- `.json`: JSON;
- common image and video suffixes: media;
- `.vue`, `.jsx`, `.tsx`: component source;
- everything else: plain text.

Root `info.md` documents a plugin. Root `context.imd` is the role-aware context entry. A non-empty root `generation.js` replaces the default Agent process. `action/` provides JavaScript slash actions and `background/` provides media candidates. These are lookup conventions rather than resource containers.

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

Containers are declared in UTF-8 resource source:

```html
<container name="角色上下文" scope="plugin">
  <include as="base">container:global/基础上下文</include>
</container>

<member_of container="container:plugin/角色上下文" as="character" />
```

`scope="root"` is visible only from the declaring directory, `plugin` is visible within the owning plugin, and `global` is visible across the enabled plugin set. Scope controls lookup and never performs automatic injection.

A resolved container is a lazy namespace:

- `get(alias)` returns one member resource;
- `use(alias)` returns an imported container;
- `list()` returns declared resource and container aliases.

Imports remain namespaced. Duplicate declarations, duplicate aliases, missing targets, plugin-root path escapes, and recursive render cycles produce diagnostics instead of last-write-wins behavior.

## Workspace

`presentation/PluginWorkspacePage.vue` keeps the two-pane tree/editor workflow:

- search, create/import, native and browser file drop, nesting, collapse, and drag move remain in the left tree;
- the selected file owns name/path/id/icon and content editing;
- Markdown enables reference syntax highlighting;
- IMD exposes structured template/data editing, raw SFC source, and compiled message preview;
- JavaScript and JSON use code-oriented editing;
- media files provide direct image or video preview;
- immutable built-in files remain readable but not writable.

Below 768px the shared responsive store switches explicitly between tree and editor.

## Runtime

`application/plugin-reference-resolver.ts` indexes enabled plugin files without evaluating them. It scans container declarations and memberships, then resolves resources only when an entry document or JavaScript process explicitly references them. Rendering is cached per resolution task and records a dependency trace.

`application/plugin-generation-environment.ts` supplies:

1. the authorized base API and active conversation values;
2. the reference resolver;
3. the first root `context.imd`;
4. the first non-empty root `generation.js`;
5. the selected action process, if any.

Conversation compiles `context.imd` directly to role-preserving messages. The selected action or root generation file is preprocessed with its source-scoped `ref` function and executed against the same minimal runtime environment.

The immutable global core plugin supplies fallback context, a global base container, actions, and background media. The package-local `项目 Agent` plugin supplies its project-aware context and format references through the same explicit model.
