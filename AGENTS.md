# PulsarAI Agent Guide

## Hard Rules

- Do not run `bun run build` unless the user explicitly asks for production packaging or build verification.
- Do not run full test suites unless the user explicitly asks.
- When reading files with PowerShell `Get-Content`, always pass `-Encoding UTF8`.
- Prefer scoped implementation, current feature seams, and small verifiable steps.
- When implementing UI components, reuse shadcn-vue components and theme CSS variables whenever practical so spacing, color, radius, focus, and state styling stay consistent.
- When implementing or changing components, explicitly consider narrow-window and mobile-platform behavior. Use the shared responsive state instead of scattering viewport or platform checks, keep touch targets usable, and provide an explicit layout fallback below 768px.
- Commands that expose feature behavior to search or hotkeys should keep their implementation in the owning feature's `actions.ts`; UI may register and route commands but should not own domain behavior.
- Plugin files are owned by `src/features/Resources/Plugin`; keep plugin list/workspace/tree controls there and do not reintroduce a generic plugin center page under `src/features/UI`. Plugins with `packageId: null` are global and managed from DefaultConfig, while non-null `packageId` values own package-local plugins. Immutable system plugins additionally use `builtIn`. Character packages store only their local external-global ordering in `globalPluginOrder`, which must be normalized when a package opens.
- Conversation generation keeps a fixed startup sequence in `Resources/Conversation/application/conversation-generation.ts`: create the blank assistant target, scan Plugin resources, assemble the Sandbox environment, expand the context structure, then hand control to the plugin process or default Agent.
- Conversation renderers are selected per `Conversation` through `rendererId`. Keep renderer UI under `Resources/Conversation/presentation`; templates persist this field and new conversations inherit it when their message path is cloned.
- Plugin contents are a nested `root` file tree. Derive file semantics from suffixes, use root `info.md` as documentation, root `generation.js` as the optional process, root `context.imd` as the seeded role-aware context structure, and ordinary `action/` and `background/` folders as runtime conventions rather than fixed containers.
- Plugin files and folders persist `inserted`, `insertPosition`, `insertDepth`, and structured `insertCondition` rows; there is no separate file enable state. Injected folders provide ordered descendant arrays. Keep built-in condition functions and their runtime environment in `Resources/Plugin/application/plugin-condition-environment.ts`; custom rows may execute through the existing Sandbox, but UI should not revert to raw multiline condition strings.
- Plugin background files use media content (`kind: "media"`) with an image or video URL and live under the conventional `background/` folder. Keep media parsing, preview, and built-in background assets under `Resources/Plugin` rather than encoding backgrounds as CSS snippets.
- Conversation actions are JavaScript files under the conventional Plugin `action/` folder. The composer stores at most one leading `ActionPart` on the user message; generation adds `action` and `prompt` to the normal Sandbox environment, and an invoked action may temporarily override only that run when its file is injected and passes the normal conditions.
- Skill and MCP integrations add AI SDK tools through `Agent/application/agent-extension-registry.ts`; do not create a separate conversation generation path for either feature.
- The built-in `askUser` tool is owned by `Agent/application/ask-user-tool.ts` and pauses the existing `ToolLoopAgent` through the Conversation generation-component requester. Keep question UI registered as `agent.ask-user` instead of creating a parallel chat or modal protocol.
- Interactive documents are owned by `src/features/Resources/InteractiveDoc`. Keep block data serializable, keep CRUD and Markdown compilation in the domain wrapper, and delegate `{{}}` evaluation to the existing Sandbox.
- Version management is owned by `src/features/Backup`. Keep full-database disaster restore separate from selective resource restore, remap parent and child IDs together when importing historical resources, and keep LAN version metadata in `src/features/Database/application/sync-metadata.ts`.
- When implementing settings forms, reuse `SettingForm` and `SettingFormField` from `src/features/Setting/presentation/` whenever practical so each field has a clear title, description, and control area.
- Feature APIs exposed to generated JavaScript must be defined in the owning feature's `capabilities.ts`. Keep `subCaps`, builder methods, API signatures/descriptions/examples, default or package grants, and behavior synchronized. `src/features/Capabilities` is the aggregation/runtime owner, and VitePress must reference these definitions instead of maintaining a second API inventory.
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
- a default AI SDK `ToolLoopAgent` path for conversation generation;
- a frontend sandbox for macro expansion and controlled JavaScript execution;
- Feature-level capability builders that assemble the default Sandbox API environment and inject the same API reference into model context and VitePress;
- appearance, font, and about settings;
- Milkdown/Crepe markdown rendering for messages and composer input;
- plugin file trees as normal workspace resources with right-sidebar control and no duplicated composer selector;
- interactive documents as block-based Markdown templates with variable bindings, component references, and a pure-Markdown compiler;
- built-in workspace pages opened through the UI resource registry rather than sidebar-local mode switching;
- SubWindow protocol and WebviewWindow adapters isolated under `src/features/SubWindow`;
- `design.md` as the project index.

MCP, Skill, and richer tool orchestration are later-phase additions.
