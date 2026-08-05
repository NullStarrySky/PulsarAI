# About

`About` owns the normal settings page for application metadata, version notes, technology stack, and lightweight local environment checks.

The page presents the shared PulsarAI application icon in its identity header. The icon keeps its monochrome artwork while the shared UI wrapper supplies theme-aware edge contrast for light and dark appearances.

The environment check adapter lives in `application/environment-check.ts`. It uses Tauri shell permission names instead of raw commands so later plugin and agent work can reuse the same detection path without leaking command execution into UI components.
