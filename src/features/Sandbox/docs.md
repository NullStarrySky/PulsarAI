# Sandbox

`Sandbox` owns controlled frontend JavaScript execution and macro expansion helpers for generation-time text.

Core exports live in `domain/sandbox.ts`:

- `runSandbox` returns `{ ok, value, error }` for external callers that should not handle thrown exceptions.
- `executeSandboxCode` and `executeSandboxCodeAsync` execute snippets against merged environment objects.
- `resolveSandboxText` expands `{{ ... }}` inline macros.
- `resolveSandboxMessages` expands message arrays and preserves AI SDK message roles where possible.
- `mergeSandboxEnvironments` appends uppercase and numeric positions so plugin and preset hooks can compose later.

The sandbox is intentionally frontend-side and minimal. Future plugin work should add explicit helpers to the environment object rather than widening global access.
