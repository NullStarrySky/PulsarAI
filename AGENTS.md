# PulsarAI Agent Guide

## Hard Rules

- Do not run `bun run build` unless the user explicitly asks for production packaging or build verification.
- Do not run full test suites unless the user explicitly asks.
- When reading files with PowerShell `Get-Content`, always pass `-Encoding UTF8`.
- Prefer scoped implementation, current feature seams, and small verifiable steps.
- When implementing UI components, reuse shadcn-vue components and theme CSS variables whenever practical so spacing, color, radius, focus, and state styling stay consistent.
- When implementing settings forms, reuse `SettingForm` and `SettingFormField` from `src/features/Setting/presentation/` whenever practical so each field has a clear title, description, and control area.

## Project Shape

Pulsar is an open LLM frontend built with Tauri, TypeScript, Vue 3, shadcn-vue, AI SDK, SurrealDB, and Milkdown.

The frontend follows a DDD-inspired feature layout under `src/features`. Each feature should own its domain types, application services, infrastructure adapters, and presentation components when those layers become necessary.

## Current Phase

The app is moving through early model-access work:

- one minimal conversation shell;
- model provider settings and default model selection;
- local SurrealDB-backed settings and secrets;
- AI SDK wrappers that hydrate provider/model references;
- `design.md` as the project index.

MCP, Skill, plugin resources, and richer generation orchestration are later-phase additions.
