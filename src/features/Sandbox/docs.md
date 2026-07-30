# Sandbox

`Sandbox` owns controlled frontend JavaScript execution and macro expansion helpers for generation-time text.

Core exports live in `domain/sandbox.ts`:

- `runSandbox` returns `{ ok, value, error }` for external callers that should not handle thrown exceptions.
- `executeSandboxCode` and `executeSandboxCodeAsync` execute snippets against merged environment objects.
- `resolveSandboxText` expands `{{ ... }}` inline macros.
- `resolveSandboxMessages` expands message arrays and preserves AI SDK message roles where possible.
- `mergeSandboxEnvironments` remains available for non-Plugin callers that intentionally compose explicit environment fragments.

Plugin resources are not merged into the Sandbox. Plugin and InteractiveDoc preprocess explicit `<@...>` tokens, then call Sandbox with only authorized base APIs, active conversation values, local IMD data through guarded `ref`, and process helpers. `resolveSandboxMessages` continues to preserve roles when `[[...]]` splices message arrays.

The sandbox is intentionally frontend-side and minimal. Future plugin work should add explicit helpers to the environment object rather than widening global access.

`Capabilities` supplies the default base environment. Authorized Feature objects are available at both `<featureId>` and `capabilities.<featureId>`, while `CAPABILITIES_PROMPT` contains the model-facing API reference generated from the same definitions. This controls the application APIs Pulsar exposes; frontend JavaScript execution itself is not an operating-system isolation boundary.
