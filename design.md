# Pulsar Design Index

## Core Goal

Pulsar is a highly open LLM frontend. The first usable milestone is a complete but minimal conversation app. Later phases add MCP, Skill, and other resources through plugins instead of hardwiring them into the first generation flow.

## Stack

- Runtime shell: `src-tauri/`
- Frontend entry: `src/main.ts`, `src/App.vue`
- UI system: `components.json`, `src/styles/globals.css`, `src/components/ui/`
- State: Pinia, initialized in `src/main.ts`
- Notifications: Notivue, initialized in `src/main.ts`
- LLM calls: AI SDK with OpenAI and DeepSeek providers
- Local data: SurrealDB client
- Rich text: Milkdown Vue and Crepe

## Feature Roots

- Database: `src/features/Database/`
- Conversation: `src/features/Resources/Conversation/`
- Interactive documents: `src/features/Resources/InteractiveDoc/`
- Plugin resources: `src/features/Resources/Plugin/`
- Reserved component resources: `src/features/Resources/Component/`
- Reserved preset resources: `src/features/Resources/Preset/`
- Setting: `src/features/Setting/`
- UI ownership: `src/features/UI/`
- Model connections: `src/features/ModelConnection/`
- Agent runtime: `src/features/Agent/`
- Sandbox: `src/features/Sandbox/`
- About: `src/features/About/`
- Hotkey: `src/features/Hotkey/`
- Version management (backup and LAN sync): `src/features/Backup/`
- Statistic: `src/features/Statistic/`
- Translate: `src/features/Translate/`
- Misc platform helpers: `src/features/Misc/`
- Notification delivery and built-in notification center: `src/features/Notification/`
- Subwindow: `src/features/SubWindow/`
- Feature API capabilities and permission assembly: `src/features/Capabilities/`
- Scheduled tasks: `src/features/UI/schedule/`

## Core Types

- `PackageCategory`, `CharacterPackage`, `Conversation`, `ChatMessageContainer`, `ChatMessage`: `src/features/Resources/Conversation/domain/conversation-types.ts`
- `ModelApiType`, `ModelDefinition`, `ModelProviderDefinition`: `src/features/ModelConnection/domain/model-provider.ts`
- `DefaultConfigs`: `src/features/defaultConfigs/domain/default-config.ts`
- `DatabaseRecord`: `src/features/Database/application/database-service.ts`
- `SettingGroup`, `SettingItem`: `src/features/Setting/domain/setting-page.ts`
- `WorkspaceTab`: `src/features/UI/application/layout-store.ts`
- `SandboxEnvironment`, `SandboxExecutionResult`, `ResolveTextOptions`: `src/features/Sandbox/domain/sandbox.ts`
- `FontDefinition`: `src/features/UI/font/domain/font-registry.ts`
- `ThemeDefinition`, `ThemeMode`: `src/features/UI/theme/domain/theme-registry.ts`
- `CommandDefinition`: `src/features/Hotkey/application/command-store.ts`
- `StatisticEvent`: `src/features/Statistic/domain/statistic.ts`
- `TranslateState`: `src/features/Translate/domain/translate.ts`
- `BackupInfo`, `BackupResourceSnapshot`, `LanSyncSnapshot`: `src/features/Backup/application/backup-store.ts`
- `ScheduleTask`, `SchedulePeriod`: `src/features/UI/schedule/domain/schedule.ts`
- `SubWindowParams`, `SubWindowTarget`, `SubWindowBridgeMessage`: `src/features/SubWindow/domain/sub-window-protocol.ts`
- `PulsarNotification`, `NotificationChannel`: `src/features/Notification/domain/notification.ts`
- `ComponentResource`: `src/features/Resources/Component/domain/component-resource.ts`
- role-aware Markdown parsing, Data bindings, and `ContextDataValue`: `src/features/Resources/InteractiveDoc/domain/interactive-document.ts`
- `Plugin`, `PluginFolder`, `PluginFile`: `src/features/Resources/Plugin/domain/plugin-types.ts`
- `PluginContainerDeclaration`, `PluginContainerMembership`, `PluginReferenceToken`: `src/features/Resources/Plugin/domain/plugin-reference.ts`
- `CapabilityDefinition`, `CapabilityGrants`, `CapabilityBuilder`: `src/features/Capabilities/domain/capability.ts`

## External Interfaces

The VitePress site lives under `docs/`. Each owning feature's `capabilities.ts` is the source of truth for external API permissions, runtime methods, model prompts, and the VitePress API reference.

- AI SDK wrapper export: `src/features/ModelConnection/application/ai.ts`
- Model hydration map and wrapped AI SDK calls: `src/features/ModelConnection/application/model-ai.ts`
- Built-in provider catalog: `src/features/ModelConnection/application/builtin-providers.ts`
- OpenAI-compatible model list fetcher: `src/features/ModelConnection/application/openai-compatible-models.ts`
- Provider/settings state: `src/features/ModelConnection/application/model-connection-store.ts`
- Secret command adapter: `src/features/ModelConnection/application/secret-service.ts`
- Tauri proxy fetch adapter: `src/features/ModelConnection/infrastructure/model-proxy-fetch.ts`
- Default agent runner: `src/features/Agent/application/default-agent.ts`
- Built-in user-question tool: `src/features/Agent/application/ask-user-tool.ts`
- Sandbox execution and macro resolution: `src/features/Sandbox/domain/sandbox.ts`
- Default config service/store: `src/features/defaultConfigs/application/`
- Tauri SurrealDB commands, resource database commands, image resource commands, and model proxy: `src-tauri/src/lib.rs`
- Resource database adapter: `src/features/Database/application/database-service.ts`
- Resource file adapter: `src/features/Resources/application/resource-file-service.ts`
- Conversation resource store: `src/features/Resources/Conversation/application/conversation-store.ts`
- Conversation generation startup and process executor: `src/features/Resources/Conversation/application/conversation-generation.ts`
- Conversation attachment encoding and preview helpers: `src/features/Resources/Conversation/application/message-attachment.ts`
- Context Markdown role compiler: `src/features/Resources/InteractiveDoc/domain/interactive-document.ts`
- Reusable `.data` definitions and isolated container API: `src/features/Resources/Plugin/domain/plugin-data.ts`
- Plugin file-tree store and priority resolver: `src/features/Resources/Plugin/application/plugin-store.ts`
- Plugin generation environment scanner: `src/features/Resources/Plugin/application/plugin-generation-environment.ts`
- Agent Skill/MCP tool registry: `src/features/Agent/application/agent-extension-registry.ts`
- Agent generation components: `src/features/Agent/presentation/`
- UI layout state: `src/features/UI/application/layout-store.ts`
- Workspace resource registry: `src/features/UI/application/workspace-resource-registry.ts`
- Shell sidebar registry: `src/features/UI/application/sidebar-registry.ts`
- Settings registry: `src/features/Setting/application/setting-registry.ts`
- Appearance store: `src/features/UI/theme/application/appearance-store.ts`
- Command registry and palette state: `src/features/Hotkey/application/command-store.ts`
- Hotkey bindings and keyboard normalization: `src/features/Hotkey/application/hotkey-store.ts`
- Core UI command registration: `src/features/UI/actions.ts`
- Conversation command actions: `src/features/Resources/Conversation/actions.ts`
- Plugin command actions: `src/features/Resources/Plugin/actions.ts`
- Runtime platform helpers: `src/features/Misc/domain/platform.ts`
- Responsive mobile-layout state: `src/features/Misc/application/responsive-store.ts`
- Temporary mobile preview command: `src/features/Misc/actions.ts`
- About environment detection: `src/features/About/application/environment-check.ts`
- Android battery optimization adapter: `src/features/Misc/application/android-battery-optimization.ts`
- Reply completion notification adapter: `src/features/Misc/application/reply-completion-notifier.ts`
- Runtime preference store: `src/features/Misc/application/runtime-preference-store.ts`
- Version management store, sync metadata, and Tauri backup/LAN commands: `src/features/Backup/application/backup-store.ts`, `src/features/Database/application/sync-metadata.ts`, `src-tauri/src/lib.rs`
- Statistic event store: `src/features/Statistic/application/statistic-store.ts`
- Translate service store: `src/features/Translate/application/translate-store.ts`
- Schedule store: `src/features/UI/schedule/application/schedule-store.ts`
- Subwindow service: `src/features/SubWindow/application/sub-window-service.ts`

## Phase 1 UI

- App shell: `src/features/UI/presentation/AppShell.vue`
- Left sidebar host: `src/features/UI/presentation/ShellLeftSidebar.vue`
- Top bar and tabs: `src/features/UI/presentation/ShellTopBar.vue`
- Right sidebar host: `src/features/UI/presentation/ShellRightSidebar.vue`
- Workspace resource host: `src/features/UI/presentation/MainWorkspace.vue`
- Conversation left sidebar: `src/features/Resources/Conversation/presentation/ConversationLeftSidebar.vue`
- Conversation right sidebar: `src/features/Resources/Conversation/presentation/ConversationRightSidebar.vue`
- Resource-bound compact conversation panel: `src/features/Resources/Conversation/presentation/ConversationResourceContextPanel.vue`
- Conversation/resource documentation context builder: `src/features/Resources/Conversation/application/conversation-resource-context.ts`
- Conversation workspace page: `src/features/Resources/Conversation/presentation/ConversationWorkspacePage.vue`
- Conversation workspace/sidebar registration: `src/features/Resources/Conversation/presentation/register-conversation-workspace.ts`
- Plugin Markdown WYSIWYG, `.data` editing, and resource-metadata bindings: `src/features/Resources/Plugin/presentation/PluginWorkspacePage.vue`
- Plugin workspace page: `src/features/Resources/Plugin/presentation/PluginWorkspacePage.vue`
- Plugin left-sidebar panel (legacy component filename): `src/features/Resources/Plugin/presentation/PluginRightSidebarPanel.vue`
- Plugin file workspace: `src/features/Resources/Plugin/presentation/PluginWorkspacePage.vue`
- Plugin workspace registration: `src/features/Resources/Plugin/presentation/register-plugin-workspace.ts`
- Settings dialog: `src/features/Setting/presentation/SettingsDialog.vue`
- General settings page: `src/features/Setting/presentation/pages/GeneralSettingsPage.vue`
- Default config settings page: `src/features/defaultConfigs/presentation/DefaultConfigSettingsPage.vue`
- Model provider settings page: `src/features/ModelConnection/presentation/ModelProviderSettingsPage.vue`
- External model picker: `src/features/ModelConnection/presentation/ModelPicker.vue`
- Model select popover: `src/features/ModelConnection/presentation/ModelSelect.vue`
- Settings form skeleton: `src/features/Setting/presentation/SettingForm.vue`, `src/features/Setting/presentation/SettingFormField.vue`
- Inline edit popover input: `src/features/UI/presentation/InlineEditInput.vue`
- Appearance settings page: `src/features/UI/presentation/AppearanceSettingsPage.vue`
- About settings page: `src/features/About/presentation/AboutSettingsPage.vue`
- Reserved component preview renderer: `src/features/Resources/Component/presentation/ComponentResourcePreview.vue`
- Reserved JavaScript preset editor: `src/features/Resources/Preset/presentation/JavaScriptCodeMirrorEditor.vue`
- Command search floating dialog: `src/features/UI/search/presentation/CommandSearchDialog.vue`
- Hotkey settings page: `src/features/Hotkey/presentation/HotkeySettingsPage.vue`
- Version management settings and selective restore: `src/features/Backup/presentation/BackupSettingsPage.vue`, `src/features/Backup/presentation/BackupResourceRestoreDialog.vue`
- Statistic settings page: `src/features/Statistic/presentation/StatisticSettingsPage.vue`
- Translate settings page: `src/features/Translate/presentation/TranslateSettingsPage.vue`
- Runtime settings page: `src/features/Misc/presentation/RuntimeSettingsPage.vue`
- Scheduled task workspace page: `src/features/UI/schedule/presentation/SchedulePage.vue`
- Subwindow bridge container: `src/features/SubWindow/presentation/SubWindowContainer.vue`

## Phase 2 Model Access

- `defaultChatModel` is stored as a string like `openai/gpt-4o-mini`.
- AI calls import wrapped functions from `src/features/ModelConnection/application/ai.ts`.
- Wrapped calls hydrate string models through provider config and model type maps, then call AI SDK providers such as `createOpenAI().chat(modelId)`.
- Provider API keys are stored by Tauri commands in local SurrealDB, never in frontend state.
- AI SDK provider `fetch` is replaced by `modelProxyFetch`, which invokes Tauri `model_proxy_fetch`; the backend replaces `<<API_KEY_NAME>>` placeholders before sending the real HTTP request.

## Phase 3 Packages And Conversation

- Character packages are conversation containers stored through `src/features/Resources/Conversation/application/conversation-store.ts`.
- Package categories and packages are ordered resources. Packages may belong to one category or to the virtual uncategorized group.
- A package owns display metadata, plugin slots, and reverse links to conversations with `lastContainerid` anchors.
- The workspace empty state creates a conversation only after the first message. The user chooses an existing character package or creates a new one, then chooses `chat` or `task`; no built-in character package is used as a storage bucket. `Conversation.kind` carries hard semantics and `Conversation.binding` records the related package, resource, path, and optional plugin.
- The right sidebar keeps conversation, merged Task, and plugin panels. The Task header manages database-backed conversation files associated with the active resource; generation receives the current resource, owning package, and relevant Feature documentation. Plugin-bound files use `kind: "test"` and stay outside the distributable plugin tree.
- The existing right-sidebar task panel creates `task` conversations in the related user package. Each task binds the exact Project API resource path from the active workspace tab, and plugin workspaces refine that path when their selected file changes.
- A conversation can be marked as the package template. Creating a conversation clones that template's active container path; without a template it creates a minimal empty system container.
- Conversations are paths of linked `ChatMessageContainer` records. Each container stores one role, sibling messages, active message index, previous container id, available next containers, and active next container.
- The active conversation path is derived from the current container by walking `previousContainer` links.
- Generation appends a user container and an empty assistant container, builds the authorized minimal runtime environment, indexes enabled Plugin declarations and resource-metadata `.data` bindings, recursively links only explicit references from root `context.md`, then runs root `agentprocess/index.js` and writes back into the same assistant message. The editable built-in workflow owns the visible `new ToolLoopAgent(...)` example; there is no implicit Agent fallback.
- User messages may persist base64 file parts with media type, filename, and size. Before generation, text and files are converted into AI SDK `UserModelMessage` array content so attachments remain part of branched and regenerated context.
- Regeneration creates an alternative message inside the current assistant container. It does not create a new container branch.
- Container branches are sibling containers linked from the previous container through `availableNextContainer`; a single next container is the normal path and is not shown as a branch badge.
- Resource images are uploaded as bytes to Tauri, renamed to UUID files under app data, stored with a `file://` prefix, and displayed through Tauri `convertFileSrc`.

## Phase 3.5 Plugin Resources

- Plugins are resource packages stored through `src/features/Resources/Plugin/application/plugin-store.ts`. A non-null `packageId` owns a local plugin; `packageId: null` identifies a global plugin managed from DefaultConfig, while `builtIn` marks a restorable system snapshot whose files remain editable.
- Each character package owns exactly one local resource plugin through `pluginId`, selects one local or global `mainPluginId` for both root `context.md` and `agentprocess/index.js`, and persists an unordered `enabledGlobalPluginIds` set. A resource-only local plugin can therefore reuse the built-in global plugin as its main generation implementation.
- Plugin order and per-plugin `main` flags do not participate in behavior. Action, custom-tool, and container namespace collisions fail explicitly; container, Regex, and tool resources use their own priority followed by stable IDs and paths for deterministic ties.
- Every plugin owns a plain nested file tree. Files have no enable switch and derive their content type from their suffix.
- Root `info.md` is the plugin documentation and opens by default. Root `manifest.json` is the single `PluginManifestGroupContent[]` configuration file; values use `group.id/content.id` paths and may render through built-in shadcn wrappers or template-only plugin components. Root `containers.json`, role-aware root `context.md`, `instruction/default.md`, `agentprocess/index.js`, `Override.vue`, `components/`, `action/`, and `background/` are exact lookup conventions rather than resource containers.
- Root `containers.json` declares scoped containers as JSON; member resources persist membership as file metadata. `<@container-name>` resolves an unambiguous visible container; `<@local:...>`, `<@path:...>`, `<@id:...>`, and `<@container:root|plugin|global/name>` provide explicit local, resource, and scoped access.
- Referenced containers remain pure lazy namespaces with `get`, `use`, and `list`; generic `ctx.containers` list/read operations retain IDs and paths. Selection, transformation, templates, and Skill execution remain in explicit `.js`, `.md`, and Agent resources rather than `containers.json`.
- Numeric depth container K is derived from file `contextPlacement.depth`, not a normal container declaration or membership. Generation rejects duplicate file names within one K, anchors every non-negative K against the same pre-insertion message list, inserts K=0 at the bottom, orders contents by normal resource priority, and applies Regex only after these role-preserving blocks are present.
- Markdown uses Milkdown as the default WYSIWYG editing surface with plugin macro/reference support. Leading YAML frontmatter round-trips through a hidden shared node instead of rendering as document content; plugin Markdown can switch to raw source to edit it. Vue files provide template-only preview, structured convention JSON can switch to raw source, `.data`, JavaScript, and ordinary JSON use code-oriented editing, and media files use image/video URL content with a direct preview.
- JavaScript files under `action/` provide slash actions. Conversation stores one leading action part per user message, exposes `{ action, prompt }` to the minimal generation environment, and lets the selected action temporarily replace `agentprocess/index.js` for one run.
- The restorable core plugin owns the bundled classroom media fallback under `background/`. The Conversation workspace mounts it as either an image or muted looping video layer.
- Project-aware context and APIs are assembled directly for package-bound `task` conversations; they no longer depend on a package-local system plugin.
- Plugins are listed from the shell's left sidebar and open directly as `resourceType: "plugin"` workspace pages. Package-local plugin metadata stays persisted but is hidden behind the package's “角色资源” presentation; global plugin metadata remains visible.

## Phase 4 Agent, Sandbox, Appearance, And Rendering

- Conversation generation asks `src/features/Agent/application/default-agent.ts` for a hydrated model, the single `codeAct` tool, constructor, stop condition, and lifecycle hooks.
- The selected plugin process decides whether to instantiate AI SDK `ToolLoopAgent`; the built-in process does so explicitly and records visible steps into `ChatMessage.meta.steps`.
- Project-Agent conversations add a scoped filesystem-style `project` Sandbox API for CRUD over the selected package's conversations and local plugin tree. The Agent inspects before writing and treats role identity, setting, relationships, voice, goals, boundaries, continuity, and context assembly as one coherent role-playing system.
- Project-Agent context includes Plugin API documentation generated from the shared Plugin capability definition, the Project filesystem API, and the role-aware context Markdown format. Side tasks additionally inject their bound resource path and start inspection there.
- `codeAct` is the only model-visible tool. Current-time lookup, Feature and Plugin APIs, extensions, custom tools, and `askUser` are authorized context functions called from the returned JavaScript function; user questions pause that CodeAct call and return the selected answer to the same agent loop.
- The sandbox in `src/features/Sandbox/domain/sandbox.ts` accepts a minimal environment object and JavaScript source, returns either a value or error, and resolves `{{...}}` / `[[...]]` macros for text and message arrays. Plugin resources are never merged into it.
- Context documents persist ordinary Markdown. Non-nesting `:::pulsar role=...` fences compile to role-preserving messages; reusable values live in `.data`, whose isolation is declared internally and whose references live in resource metadata.
- The main workspace empty state hosts the project-Agent conversation starter. Plugin `.md` resources default to Milkdown and expose raw-source switching for metadata; Vue and structured convention JSON renderers also expose source switching.
- Conversation messages render markdown through `ConversationMarkdown.vue`; the bottom composer uses `ConversationComposerEditor.vue`. Both use Milkdown/Crepe.
- Conversations persist a `rendererId` selected from the right-sidebar menu. `NovelConversationRenderer.vue` presents assistant messages as centered, navigable chapters and hides each preceding user prompt in a collapsed disclosure; template-created conversations inherit the renderer.
- UI opens tabs with `resourceType`, `resourceId`, optional `packageId`, and optional `resourceParams`; `MainWorkspace.vue` resolves the component through `workspace-resource-registry.ts` and keeps active resource pages alive with `KeepAlive`.
- Feature-specific sidebar content is registered through `sidebar-registry.ts`; UI shell files do not import conversation stores or message renderers directly.
- Appearance settings are owned by `appearance-store.ts`, theme registry CSS under `src/features/UI/theme/`, and font registry under `src/features/UI/font/`.
- About settings are registered as a normal settings page under `src/features/About/`.
- About settings include lightweight environment checks for command-line tools used by later plugin and agent workflows.

## Phase 5 Misc Tools

- Global search is a floating command palette, not a workspace page. It searches registered commands, character packages, and conversation resources; `tag:` is reserved as a tag-filter query prefix.
- Commands are registered through `CommandDefinition` and can be executed by search or hotkeys. Feature-owned commands should live in that feature's `actions.ts` and be registered from `src/features/UI/actions.ts` only as shell wiring.
- Hotkeys persist local overrides in `hotkey-store.ts`; the shell captures keyboard events and dispatches the matched command.
- `DefaultConfig` owns default model, fast model, embedding model, and image model as string model references.
- Version management provides full local database history, selective package/conversation/plugin recovery, and paired LAN resource synchronization. WebDAV remains a configuration-only future transport.
- Statistic records launch and message events in `statistic_events`, while resource counts and estimated data sizes are derived from current Conversation state.
- Translate exposes a Pinia service. Google public translate is available for quick tests; Microsoft/Azure translation is a configurable provider placeholder until subscription key plumbing is added.

## Phase 6 Schedule, Subwindows, And Whiteboard

- Built-in workspace pages use `resourceType: "builtin"` plus `resourceId` and register through `workspace-resource-registry.ts`. The left sidebar opens schedule as a built-in page while plugin resources open through their own workspace resource type.
- Schedule tasks persist in `ui_schedule_tasks`, support daily or weekly periods, random execution inside a time range, prompt text, and a target conversation selected through a searchable conversation selector.
- The schedule store owns runtime ticking and immediate execution. Execution opens the target conversation and sends the configured prompt through the normal conversation path.
- Subwindows are described by `SubWindowParams` and opened by `sub-window-service.ts` through Tauri `WebviewWindow`. Simplified mode hides sidebars and opens the requested resource from URL parameters.
- `SubWindowContainer.vue` is the reusable local-IPC bridge wrapper for future component-level popout surfaces.
- Conversation composer includes an Excalidraw iframe whiteboard entry in the input toolbar.
- Mobile layout is driven by either the runtime platform helper or a viewport below 768px. `Ctrl+Shift+M` temporarily overrides the platform result and resizes the desktop window to a 390 x 780 logical mobile preview.

## Runtime Notifications And Android Power

- Runtime settings expose reply-completion sound, reply-completion system notifications, and a foreground guard so alerts only fire when Pulsar is not focused by default.
- Reply completion notification logic lives in `reply-completion-notifier.ts` and is triggered after successful assistant generation in `conversation-store.ts`.
- Android battery optimization controls are hidden outside Android through `Misc` platform helpers. On Android they wrap `tauri-plugin-android-battery-optimization-api` for status, exemption request, and opening system settings.
- Tauri registers `tauri-plugin-notifications` on all platforms and `tauri-plugin-android-battery-optimization` only for Android target builds.

## Working Principle

The app keeps one visible conversation flow. UI events enter feature application services, application services coordinate domain objects and repositories, repositories use SurrealDB or provider adapters, and presentation components stay thin.

The plugin system links only explicitly referenced files into the visible conversation flow without replacing the core `Conversation -> ModelConnection -> Database` path. Each character package explicitly selects one local or global main plugin; that same plugin must provide both root `context.md` and a non-empty `agentprocess/index.js`, otherwise generation fails explicitly.
