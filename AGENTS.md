# PulsarAI Agent Guide

## Hard Rules

- Do not run `bun run build` unless the user explicitly asks for production packaging or build verification.
- Do not run full test suites unless the user explicitly asks.
- When reading files with PowerShell `Get-Content`, always pass `-Encoding UTF8`.
- Prefer scoped implementation, current feature seams, and small verifiable steps.
- When implementing UI components, reuse shadcn-vue components and theme CSS variables whenever practical so spacing, color, radius, focus, and state styling stay consistent.
- Commands that expose feature behavior to search or hotkeys should keep their implementation in the owning feature's `actions.ts`; UI may register and route commands but should not own domain behavior.
- When implementing settings forms, reuse `SettingForm` and `SettingFormField` from `src/features/Setting/presentation/` whenever practical so each field has a clear title, description, and control area.

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
- appearance, font, and about settings;
- Milkdown/Crepe markdown rendering for messages and composer input;
- `design.md` as the project index.

MCP, Skill, plugin resources, and richer tool orchestration are later-phase additions.
