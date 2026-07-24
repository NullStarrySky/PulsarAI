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

Phase 0 has not introduced domain types yet. The planned first types are:

- `Conversation`, `ConversationMessage`, `ConversationId`: `src/features/Resources/Conversation/domain/`
- `ModelProviderDefinition`, `ModelProviderConnection`: `src/features/ModelConnection/domain/model-provider.ts`
- `DatabaseConnection`, `RepositoryRecord`: `src/features/Database/domain/`
- `SettingGroup`, `SettingItem`: `src/features/Setting/domain/setting-page.ts`
- `WorkspaceTab`: `src/features/UI/application/layout-store.ts`

## External Interfaces

Phase 0 only installs the integration points. The planned first adapters are:

- AI SDK provider adapter: `src/features/ModelConnection/infrastructure/`
- SurrealDB local adapter: `src/features/Database/infrastructure/`
- Conversation persistence repository: `src/features/Resources/Conversation/infrastructure/`
- UI layout state: `src/features/UI/application/layout-store.ts`
- Settings registry: `src/features/Setting/application/setting-registry.ts`
- Built-in provider catalog: `src/features/ModelConnection/application/builtin-providers.ts`

## Phase 1 UI

- App shell: `src/features/UI/presentation/AppShell.vue`
- Left sidebar: `src/features/UI/presentation/ShellLeftSidebar.vue`
- Top bar and tabs: `src/features/UI/presentation/ShellTopBar.vue`
- Right sidebar: `src/features/UI/presentation/ShellRightSidebar.vue`
- Empty test workspace: `src/features/UI/presentation/MainWorkspace.vue`
- Settings dialog: `src/features/Setting/presentation/SettingsDialog.vue`
- General settings test page: `src/features/Setting/presentation/pages/GeneralSettingsPage.vue`
- Model provider settings page: `src/features/ModelConnection/presentation/ModelProviderSettingsPage.vue`

## Working Principle

The app keeps one visible conversation flow. UI events enter feature application services, application services coordinate domain objects and repositories, repositories use SurrealDB or provider adapters, and presentation components stay thin.

The plugin system is intentionally out of the phase 0 path. Future plugins should contribute resources into the generation flow without replacing the core `Conversation -> ModelConnection -> Database` path.
