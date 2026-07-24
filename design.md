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
- Setting: `src/features/Setting/`
- UI ownership: `src/features/UI/`
- Model connections: `src/features/ModelConnection/`
- Agent runtime: `src/features/Agent/`
- Sandbox: `src/features/Sandbox/`
- About: `src/features/About/`
- Hotkey: `src/features/Hotkey/`
- Backup: `src/features/Backup/`
- Statistic: `src/features/Statistic/`
- Translate: `src/features/Translate/`
- Misc platform helpers: `src/features/Misc/`
- Subwindow: `src/features/SubWindow/`
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
- `BackupInfo`, `BackupEndpointSettings`, `RemoteBackupSettings`: `src/features/Backup/application/backup-store.ts`
- `ScheduleTask`, `SchedulePeriod`: `src/features/UI/schedule/domain/schedule.ts`
- `SubWindowParams`, `SubWindowTarget`, `SubWindowBridgeMessage`: `src/features/SubWindow/domain/sub-window-protocol.ts`

## External Interfaces

- AI SDK wrapper export: `src/features/ModelConnection/application/ai.ts`
- Model hydration map and wrapped AI SDK calls: `src/features/ModelConnection/application/model-ai.ts`
- Built-in provider catalog: `src/features/ModelConnection/application/builtin-providers.ts`
- OpenAI-compatible model list fetcher: `src/features/ModelConnection/application/openai-compatible-models.ts`
- Provider/settings state: `src/features/ModelConnection/application/model-connection-store.ts`
- Secret command adapter: `src/features/ModelConnection/application/secret-service.ts`
- Tauri proxy fetch adapter: `src/features/ModelConnection/infrastructure/model-proxy-fetch.ts`
- Default agent runner: `src/features/Agent/application/default-agent.ts`
- Sandbox execution and macro resolution: `src/features/Sandbox/domain/sandbox.ts`
- Default config service/store: `src/features/defaultConfigs/application/`
- Tauri SurrealDB commands, resource database commands, image resource commands, and model proxy: `src-tauri/src/lib.rs`
- Resource database adapter: `src/features/Database/application/database-service.ts`
- Resource file adapter: `src/features/Resources/application/resource-file-service.ts`
- Conversation resource store: `src/features/Resources/Conversation/application/conversation-store.ts`
- UI layout state: `src/features/UI/application/layout-store.ts`
- Workspace resource registry: `src/features/UI/application/workspace-resource-registry.ts`
- Shell sidebar registry: `src/features/UI/application/sidebar-registry.ts`
- Settings registry: `src/features/Setting/application/setting-registry.ts`
- Appearance store: `src/features/UI/theme/application/appearance-store.ts`
- Command registry and palette state: `src/features/Hotkey/application/command-store.ts`
- Hotkey bindings and keyboard normalization: `src/features/Hotkey/application/hotkey-store.ts`
- Core UI command registration: `src/features/UI/actions.ts`
- Conversation command actions: `src/features/Resources/Conversation/actions.ts`
- Runtime platform helpers: `src/features/Misc/domain/platform.ts`
- Android battery optimization adapter: `src/features/Misc/application/android-battery-optimization.ts`
- Reply completion notification adapter: `src/features/Misc/application/reply-completion-notifier.ts`
- Runtime preference store: `src/features/Misc/application/runtime-preference-store.ts`
- Backup store and Tauri backup commands: `src/features/Backup/application/backup-store.ts`, `src-tauri/src/lib.rs`
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
- Conversation workspace page: `src/features/Resources/Conversation/presentation/ConversationWorkspacePage.vue`
- Conversation workspace/sidebar registration: `src/features/Resources/Conversation/presentation/register-conversation-workspace.ts`
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
- Command search floating dialog: `src/features/UI/search/presentation/CommandSearchDialog.vue`
- Hotkey settings page: `src/features/Hotkey/presentation/HotkeySettingsPage.vue`
- Backup settings page: `src/features/Backup/presentation/BackupSettingsPage.vue`
- Statistic settings page: `src/features/Statistic/presentation/StatisticSettingsPage.vue`
- Translate settings page: `src/features/Translate/presentation/TranslateSettingsPage.vue`
- Runtime settings page: `src/features/Misc/presentation/RuntimeSettingsPage.vue`
- Scheduled task workspace page: `src/features/UI/schedule/presentation/SchedulePage.vue`
- Built-in plugin placeholder page: `src/features/UI/builtin/presentation/PluginPlaceholderPage.vue`
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
- A conversation can be marked as the package template. Creating a conversation clones that template's active container path; without a template it creates a minimal empty system container.
- Conversations are paths of linked `ChatMessageContainer` records. Each container stores one role, sibling messages, active message index, previous container id, available next containers, and active next container.
- The active conversation path is derived from the current container by walking `previousContainer` links.
- Generation appends a user container and an assistant container, hydrates the default chat model through ModelConnection, and writes the AI SDK response into the assistant message.
- Regeneration creates an alternative message inside the current assistant container. It does not create a new container branch.
- Container branches are sibling containers linked from the previous container through `availableNextContainer`; a single next container is the normal path and is not shown as a branch badge.
- Resource images are uploaded as bytes to Tauri, renamed to UUID files under app data, stored with a `file://` prefix, and displayed through Tauri `convertFileSrc`.

## Phase 4 Agent, Sandbox, Appearance, And Rendering

- Conversation generation now enters `runDefaultAgent` in `src/features/Agent/application/default-agent.ts`.
- The default agent hydrates `defaultChatModel` through ModelConnection, runs AI SDK `ToolLoopAgent`, and records visible process steps into `ChatMessage.meta.steps`.
- Built-in tools currently include current-time lookup and JavaScript execution through the frontend sandbox.
- The sandbox in `src/features/Sandbox/domain/sandbox.ts` accepts an environment object and JavaScript source, returns either a value or error, and resolves `{{...}}` / `[[...]]` macros for text and message arrays.
- Conversation messages render markdown through `ConversationMarkdown.vue`; the bottom composer uses `ConversationComposerEditor.vue`. Both use Milkdown/Crepe.
- UI opens tabs with `resourceType`, `resourceId`, optional `packageId`, and optional `resourceParams`; `MainWorkspace.vue` resolves the component through `workspace-resource-registry.ts` and keeps active resource pages alive with `KeepAlive`.
- Feature-specific sidebar content is registered through `sidebar-registry.ts`; UI shell files do not import conversation stores or message renderers directly.
- Appearance settings are owned by `appearance-store.ts`, theme registry CSS under `src/features/UI/theme/`, and font registry under `src/features/UI/font/`.
- About settings are registered as a normal settings page under `src/features/About/`.

## Phase 5 Misc Tools

- Global search is a floating command palette, not a workspace page. It searches registered commands, character packages, and conversation resources; `tag:` is reserved as a tag-filter query prefix.
- Commands are registered through `CommandDefinition` and can be executed by search or hotkeys. Feature-owned commands should live in that feature's `actions.ts` and be registered from `src/features/UI/actions.ts` only as shell wiring.
- Hotkeys persist local overrides in `hotkey-store.ts`; the shell captures keyboard events and dispatches the matched command.
- `DefaultConfig` owns default model, fast model, embedding model, and image model as string model references.
- Backup has local JSON backup commands in Tauri for core tables and a WebDAV settings surface for later remote transfer.
- Statistic records launch and message events in `statistic_events`, while resource counts and estimated data sizes are derived from current Conversation state.
- Translate exposes a Pinia service. Google public translate is available for quick tests; Microsoft/Azure translation is a configurable provider placeholder until subscription key plumbing is added.

## Phase 6 Schedule, Subwindows, And Whiteboard

- Built-in workspace pages use `resourceType: "builtin"` plus `resourceId` and register through `workspace-resource-registry.ts`. The left sidebar opens these pages as links while keeping the character package list visible.
- Schedule tasks persist in `ui_schedule_tasks`, support daily or weekly periods, random execution inside a time range, prompt text, and a target conversation selected through a searchable conversation selector.
- The schedule store owns runtime ticking and immediate execution. Execution opens the target conversation and sends the configured prompt through the normal conversation path.
- Subwindows are described by `SubWindowParams` and opened by `sub-window-service.ts` through Tauri `WebviewWindow`. Simplified mode hides sidebars and opens the requested resource from URL parameters.
- `SubWindowContainer.vue` is the reusable local-IPC bridge wrapper for future component-level popout surfaces.
- Conversation composer includes an Excalidraw iframe whiteboard entry in the input toolbar.

## Runtime Notifications And Android Power

- Runtime settings expose reply-completion sound, reply-completion system notifications, and a foreground guard so alerts only fire when Pulsar is not focused by default.
- Reply completion notification logic lives in `reply-completion-notifier.ts` and is triggered after successful assistant generation in `conversation-store.ts`.
- Android battery optimization controls are hidden outside Android through `Misc` platform helpers. On Android they wrap `tauri-plugin-android-battery-optimization-api` for status, exemption request, and opening system settings.
- Tauri registers `tauri-plugin-notifications` on all platforms and `tauri-plugin-android-battery-optimization` only for Android target builds.

## Working Principle

The app keeps one visible conversation flow. UI events enter feature application services, application services coordinate domain objects and repositories, repositories use SurrealDB or provider adapters, and presentation components stay thin.

The plugin system is intentionally out of the early path. Future plugins should contribute resources into the generation flow without replacing the core `Conversation -> ModelConnection -> Database` path.
