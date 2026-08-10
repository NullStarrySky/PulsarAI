# Migrations

Migrations owns import-time interpretation of external application data. It is not a compatibility runtime and does not add foreign APIs, event buses, macros, or storage conventions to normal PulsarAI generation.

The SillyTavern importer is under `SillyTavern/` and follows a two-phase flow:

1. `Reader` scans a user-selected path and produces source records without writing application state.
2. `Discriminator` reports a selected resource kind, confidence, evidence, and plausible alternatives.
3. pure converters create `MigrationArtifact` values while retaining source references, diagnostics, and unconsumed fields.
4. `Placer` resolves character, chat, persona, and worldbook ownership into a previewable `PlacementPlan`.
5. `Importer.commit()` writes only the exact previously previewed plan and refuses blocking conflicts or existing stable IDs.

Filesystem access is isolated behind `SillyTavernReaderTransport`. The Tauri implementation provides path scanning, bounded text/media reads, and PNG `tEXt` character-card extraction. Conversion code must remain usable with an in-memory transport for focused tests.

Imported Plugins contain `migration/sillytavern-import-report.json` with provenance, unresolved fields, relationships, and diagnostics. These files have no insertion target and never enter generation automatically.

Simple, non-nested SillyTavern macros and synchronous ST-Prompt-Template EJS are source-transformed by one shared converter into ordinary `{{ JavaScript }}` expressions. Unsupported control flow, flags, nested macros, async/includes, foreign APIs, and UI/event dependencies become inert comments plus diagnostics; external parsers never enter the runtime. See `SillyTavern/模板转换.md`.

SillyTavern preset migration accepts only Chat Completion presets under `OpenAI Settings`. Text-completion preset directories are excluded by the Reader. Absolute-depth OpenAI prompts become dormant `.md` resources beside the preset `.chat.json` so their depth and order remain recoverable without activating every imported preset.
