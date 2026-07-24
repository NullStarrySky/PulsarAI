# PulsarAI Agent Guide

## Hard Rules

- Do not run `bun run build` unless the user explicitly asks for production packaging or build verification.
- Do not run full test suites unless the user explicitly asks.
- When reading files with PowerShell `Get-Content`, always pass `-Encoding UTF8`.
- Prefer scoped implementation, current feature seams, and small verifiable steps.
- When implementing UI components, reuse shadcn-vue components and theme CSS variables whenever practical so spacing, color, radius, focus, and state styling stay consistent.

## Project Shape

Pulsar is an open LLM frontend built with Tauri, TypeScript, Vue 3, shadcn-vue, AI SDK, SurrealDB, and Milkdown.

The frontend follows a DDD-inspired feature layout under `src/features`. Each feature should own its domain types, application services, infrastructure adapters, and presentation components when those layers become necessary.

## Current Phase

Phase 0 keeps the app intentionally small:

- one minimal conversation shell;
- dependency and UI foundation;
- empty feature roots for Database, Conversation, Setting, UI, and ModelConnection;
- `design.md` as the project index.

MCP, Skill, plugin resources, and richer generation orchestration are later-phase additions.
