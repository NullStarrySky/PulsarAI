# Sandbox

`Sandbox` owns controlled frontend JavaScript execution and macro expansion helpers for generation-time text.

Core exports live in `domain/sandbox.ts`:

- `runSandbox` returns `{ ok, value, error }` for external callers that should not handle thrown exceptions.
- `executeSandboxCode` and `executeSandboxCodeAsync` execute snippets against merged environment objects.
- `resolveSandboxText` expands `{{ ... }}` inline macros.
- `resolveSandboxMessages` expands message arrays and preserves AI SDK message roles where possible.
- `mergeSandboxEnvironments` appends uppercase and numeric positions so plugin and preset hooks can compose later.

Plugin insertion conditions run against the active-path environment before resources are added. Context structures are then expanded with the final environment through `resolveSandboxMessages`, allowing `{{...}}` string macros and role-preserving `[[...]]` message splices in the same template.

The sandbox is intentionally frontend-side and minimal. Future plugin work should add explicit helpers to the environment object rather than widening global access.

`Capabilities` supplies the default base environment before path and plugin resource environments are merged. Authorized Feature objects are available at both `<featureId>` and `capabilities.<featureId>`. `CAPABILITIES_PROMPT` and `API_DOCUMENTATION` contain the model-facing API reference generated from the same definitions. This controls the application APIs Pulsar exposes; frontend JavaScript execution itself is not an operating-system isolation boundary.
