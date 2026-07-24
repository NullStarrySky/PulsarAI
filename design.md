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

## Core Types

- `Conversation`, `ConversationMessage`, `ConversationId`: `src/features/Resources/Conversation/domain/`
- `ModelApiType`, `ModelDefinition`, `ModelProviderDefinition`: `src/features/ModelConnection/domain/model-provider.ts`
- `DefaultConfigs`: `src/features/defaultConfigs/domain/default-config.ts`
- `DatabaseConnection`, `RepositoryRecord`: `src/features/Database/domain/`
- `SettingGroup`, `SettingItem`: `src/features/Setting/domain/setting-page.ts`
- `WorkspaceTab`: `src/features/UI/application/layout-store.ts`

## External Interfaces

- AI SDK wrapper export: `src/features/ModelConnection/application/ai.ts`
- Model hydration map and wrapped AI SDK calls: `src/features/ModelConnection/application/model-ai.ts`
- Built-in provider catalog: `src/features/ModelConnection/application/builtin-providers.ts`
- OpenAI-compatible model list fetcher: `src/features/ModelConnection/application/openai-compatible-models.ts`
- Provider/settings state: `src/features/ModelConnection/application/model-connection-store.ts`
- Secret command adapter: `src/features/ModelConnection/application/secret-service.ts`
- Tauri proxy fetch adapter: `src/features/ModelConnection/infrastructure/model-proxy-fetch.ts`
- Default config service/store: `src/features/defaultConfigs/application/`
- Tauri SurrealDB commands and model proxy: `src-tauri/src/lib.rs`
- SurrealDB local adapter: `src/features/Database/infrastructure/`
- Conversation persistence repository: `src/features/Resources/Conversation/infrastructure/`
- UI layout state: `src/features/UI/application/layout-store.ts`
- Settings registry: `src/features/Setting/application/setting-registry.ts`

## Phase 1 UI

- App shell: `src/features/UI/presentation/AppShell.vue`
- Left sidebar: `src/features/UI/presentation/ShellLeftSidebar.vue`
- Top bar and tabs: `src/features/UI/presentation/ShellTopBar.vue`
- Right sidebar: `src/features/UI/presentation/ShellRightSidebar.vue`
- Minimal chat workspace: `src/features/UI/presentation/MainWorkspace.vue`
- Settings dialog: `src/features/Setting/presentation/SettingsDialog.vue`
- General settings page: `src/features/Setting/presentation/pages/GeneralSettingsPage.vue`
- Default config settings page: `src/features/defaultConfigs/presentation/DefaultConfigSettingsPage.vue`
- Model provider settings page: `src/features/ModelConnection/presentation/ModelProviderSettingsPage.vue`
- External model picker: `src/features/ModelConnection/presentation/ModelPicker.vue`
- Model select popover: `src/features/ModelConnection/presentation/ModelSelect.vue`
- Settings form skeleton: `src/features/Setting/presentation/SettingForm.vue`, `src/features/Setting/presentation/SettingFormField.vue`

## Phase 2 Model Access

- `defaultChatModel` is stored as a string like `openai/gpt-4o-mini`.
- AI calls import wrapped functions from `src/features/ModelConnection/application/ai.ts`.
- Wrapped calls hydrate string models through provider config and model type maps, then call AI SDK providers such as `createOpenAI().chat(modelId)`.
- Provider API keys are stored by Tauri commands in local SurrealDB, never in frontend state.
- AI SDK provider `fetch` is replaced by `modelProxyFetch`, which invokes Tauri `model_proxy_fetch`; the backend replaces `<<API_KEY_NAME>>` placeholders before sending the real HTTP request.

## Working Principle

The app keeps one visible conversation flow. UI events enter feature application services, application services coordinate domain objects and repositories, repositories use SurrealDB or provider adapters, and presentation components stay thin.

The plugin system is intentionally out of the early path. Future plugins should contribute resources into the generation flow without replacing the core `Conversation -> ModelConnection -> Database` path.
