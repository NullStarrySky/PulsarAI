# PulsarAI Agent Guide

## Hard Rules

- Do not run `bun run build` unless the user explicitly asks for production packaging or build verification.
- Do not run full test suites unless the user explicitly asks.
- When reading files with PowerShell `Get-Content`, always pass `-Encoding UTF8`.
- Prefer scoped implementation, current feature seams, and small verifiable steps.
- When implementing UI components, reuse shadcn-vue components and theme CSS variables whenever practical so spacing, color, radius, focus, and state styling stay consistent.
- When implementing or changing components, explicitly consider narrow-window and mobile-platform behavior. Use the shared responsive state instead of scattering viewport or platform checks, keep touch targets usable, and provide an explicit layout fallback below 768px.
- Commands that expose feature behavior to search or hotkeys should keep their implementation in the owning feature's `actions.ts`; UI may register and route commands but should not own domain behavior.
- Plugin files are owned by `src/features/Resources/Plugin`; keep plugin list/workspace/tree controls there and do not reintroduce a generic plugin center page under `src/features/UI`. Plugins with `packageId: null` are global and managed from DefaultConfig, while non-null `packageId` values own package-local plugins. System plugins additionally use `builtIn`, remain editable, and expose restore-to-default instead of write locks. Character packages store only their local external-global ordering in `globalPluginOrder`, which must be normalized when a package opens.
- Conversation generation keeps a fixed startup sequence in `Resources/Conversation/application/conversation-generation.ts`: create the blank assistant target, build the minimal authorized runtime environment, index Plugin containers and explicit references, compile the root `context.imd`, then hand control to root `agentprocess/index.js`. Agent exposes a lazy `agent.prepare()` resource provider, while the visible built-in process owns `new ToolLoopAgent(...)`; custom non-Agent flows must not hydrate a model, and no implicit default-Agent fallback may be restored.
- Conversations always belong to a user character package and use `Conversation.kind` (`chat`, `task`, or `test`) for hard semantics. Persist resource relationships in `Conversation.binding`; do not introduce a system character package as a storage bucket. Task conversations with a package-bound resource use `Agent/application/project-agent-runtime.ts`.
- Keep the existing right-sidebar conversation and plugin panels. The third panel is the merged `任务` panel: derive its binding from the active workspace resource, include the current resource, owning package, and relevant Feature guide in generation context, and manage associated task/test conversation files from its header. It uses the shared conversation composer. Plugin tests are database conversations with `kind: "test"` and a plugin binding, never message-history files inside the plugin tree.
- Conversation renderers are selected per `Conversation` through `rendererId`. Keep renderer UI under `Resources/Conversation/presentation`; templates persist this field and new conversations inherit it when their message path is cloned.
- Plugin contents are a nested `root` file tree. Derive ordinary file semantics from suffixes, but select convention-file editors and runtime roles by exact root filename. Use `info.md` as documentation, reserved empty `manifest.json` as the future single configuration file, `containers.xml` for container topology, `context.imd` as the role-aware entry document, `agentprocess/index.js` as the only plugin process entry, `Override.vue` as the default conversation-renderer override, and `components/` for reusable plugin Vue components. Vue preview is template-only and must not execute plugin `<script>`. Do not add implicit fallback entries or automatic plugin-tree rewrites.
- Plugin resources never become ambient Sandbox variables. Cross-resource access must use `<@container-name>` for an unambiguous visible container or explicit `<@local:...>`, `<@path:...>`, `<@id:...>`, and `<@container:root|plugin|global/name>` references. Container declarations and namespaced container references belong to root `containers.xml`; member relationships persist on `PluginFile.memberships` metadata, never as `<member_of>` content. Containers remain lazy namespaces and must report collisions, missing references, and cycles instead of applying last-write-wins merges.
- Plugin container declarations may include an optional description. Keep it serialized in root `containers.xml`, editable in the filename-specific container editor, and available to IMD `<@...>` completion together with scope and owning-plugin context; descriptions are authoring metadata and must not be injected into generation automatically.
- Plugin files persist an independent numeric `priority`, defaulting to `100`. Higher-priority members enter resolved containers first while equal priorities preserve normal plugin/tree order.
- Plugin background files use media content (`kind: "media"`) with an image or video URL and live under the conventional `background/` folder. All media descendants are available by convention; keep media parsing, preview, and built-in background assets under `Resources/Plugin` rather than encoding backgrounds as CSS snippets.
- Conversation actions are JavaScript files under the conventional Plugin `action/` folder. The composer stores at most one leading `ActionPart` on the user message; generation adds `action` and `prompt` to the minimal Sandbox environment, and an invoked action temporarily replaces the normal `agentprocess/index.js` entry for that run.
- Skill and MCP integrations add AI SDK tools through `Agent/application/agent-extension-registry.ts`; do not create a separate conversation generation path for either feature.
- The built-in `askUser` tool is owned by `Agent/application/ask-user-tool.ts` and pauses a plugin-process-created `ToolLoopAgent` through the Conversation generation-component requester. Keep question UI registered as `agent.ask-user` instead of creating a parallel chat or modal protocol.
- Interactive documents are owned by `src/features/Resources/InteractiveDoc`. Persist `.imd` as SFC-like UTF-8 source with repeatable `<prompt_template>` blocks and `<data>/<sub_data>` declarations, keep parsing/serialization/preview compilation in the domain module, and delegate `{{}}` / `[[ ]]` evaluation to the existing Sandbox after explicit references are linked.
- Version management is owned by `src/features/Backup`. Keep full-database disaster restore separate from selective resource restore, remap parent and child IDs together when importing historical resources, and keep LAN version metadata in `src/features/Database/application/sync-metadata.ts`.
- When implementing settings forms, reuse `SettingForm` and `SettingFormField` from `src/features/Setting/presentation/` whenever practical so each field has a clear title, description, and control area.
- Feature APIs exposed to generated JavaScript must be defined in the owning feature's `capabilities.ts`. Keep `subCaps`, builder methods, API signatures/descriptions/examples, default or package grants, and behavior synchronized. `src/features/Capabilities` is the aggregation/runtime owner, and VitePress must reference these definitions instead of maintaining a second API inventory.
- Capability definitions that must also be consumed without loading their runtime store dependencies may live in the owning Feature's `domain/` module and be re-exported from `capabilities.ts`. Project Agent context must generate Plugin API documentation from that shared definition instead of copying signatures into its prompt.
- Conversation composer toolbar placement is owned by the UI appearance store as normalized `left`, `right`, and `unused` arrays. New composer tools must be added to the shared toolbar catalog and receive a migration/default placement instead of being hard-coded into the workspace footer.
- Native and built-in notifications go through `features/Notification/application/notification-service.ts`; external delivery is the default, while `channel: "internal"` writes to the built-in notification center.
- Top-bar tab status is generic UI state exposed by `layout-store.ts`. Feature code may set status for its own resource tab, but the UI shell owns status rendering.
- `todo.md` is a migrated backlog/reference file. Treat it as project context when planning feature work, but do not delete completed or skipped items unless explicitly asked.

## Project Shape

Pulsar is an open LLM frontend built with Tauri, TypeScript, Vue 3, shadcn-vue, AI SDK, SurrealDB, and Milkdown.

The frontend follows a DDD-inspired feature layout under `src/features`. Each feature should own its domain types, application services, infrastructure adapters, and presentation components when those layers become necessary.

`src/features/UI` owns only shell, tab, sidebar host, and generic resource-hosting mechanics. Feature-specific resource pages and sidebar contents must live in their owning feature and register into UI through the resource/sidebar registries.

## Current Phase

The app is moving through the basic agent and conversation-runtime phase:

- one minimal conversation shell;
- model provider settings and default model selection;
- local SurrealDB-backed settings and secrets;
- AI SDK wrappers that hydrate provider/model references;
- an editable built-in plugin workflow that constructs AI SDK `ToolLoopAgent` from Agent-provided model/tools;
- a frontend sandbox for macro expansion and controlled JavaScript execution;
- Feature-level capability builders that assemble the default Sandbox API environment and inject the same API reference into model context and VitePress;
- appearance, font, and about settings;
- Milkdown/Crepe markdown rendering for messages and composer input;
- plugin file trees as normal workspace resources with scoped lazy containers, explicit references, and no duplicated composer selector;
- interactive documents as SFC-like role templates plus local data, Milkdown reference highlighting, and compiled preview;
- built-in workspace pages opened through the UI resource registry rather than sidebar-local mode switching;
- SubWindow protocol and WebviewWindow adapters isolated under `src/features/SubWindow`;
- `design.md` as the project index.

MCP, Skill, and richer tool orchestration are later-phase additions.
