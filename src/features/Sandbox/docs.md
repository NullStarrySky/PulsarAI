# Sandbox

`Sandbox` owns controlled frontend JavaScript execution and macro expansion helpers for generation-time text.

Core exports live in `domain/sandbox.ts`:

- `runSandbox` returns `{ ok, value, error }` for external callers that should not handle thrown exceptions.
- `executeSandboxCode` and `executeSandboxCodeAsync` execute snippets against merged environment objects.
- `createSandboxFunction` compiles one function expression without invoking it immediately, then preserves the authorized scope for later Plugin custom-tool calls.
- Agent CodeAct validates that model-generated source is one function with an explicit `return`, then delegates execution to `executeSandboxCodeAsync`.
- `resolveSandboxText` expands `{{ ... }}` inline macros.
- `resolveSandboxMessages` expands message arrays and preserves AI SDK message roles where possible.
- `mergeSandboxEnvironments` remains available for non-Plugin callers that intentionally compose explicit environment fragments.

Plugin resources are not merged into the Sandbox. Plugin and context-document compilation preprocess explicit `<@...>` tokens, then call Sandbox with only authorized base APIs, active conversation values, resource-metadata-bound `.data`, and process helpers. `resolveSandboxMessages` continues to preserve roles when `[[...]]` splices message arrays.

The sandbox is intentionally frontend-side and minimal. Future plugin work should add explicit helpers to the environment object rather than widening global access.

Dangerous browser globals use the same grant editor as Feature APIs through the `globals` capability. Direct identifiers that can perform network access, persist browser data, control the page/navigation, create workers, or dynamically compile code resolve through a scoped Proxy. `window`, `self`, and `globalThis` expose the same filtered view. An ungranted dangerous global resolves to a callable placeholder Proxy and throws a permission error when code reads, calls, constructs, writes, or deletes through it.

Ordinary globals such as language built-ins, `console`, timers, animation helpers, URL parsing, text encoding, and `crypto` remain available without a grant. Values explicitly injected into the Sandbox environment always take precedence. The controlled list is intentionally small and explicit rather than treating every browser global as a permission.

This Proxy boundary is intended to prevent accidental ambient browser access and make authorization failures explicit. It is not a hostile-code security boundary: JavaScript reflection and constructor chains cannot be comprehensively isolated inside the same browser realm. Untrusted external scripts must still remain disabled until the user reviews and authorizes them.

`Capabilities` supplies the default base environment. Authorized Feature objects are available at both `<featureId>` and `capabilities.<featureId>`, while `CAPABILITIES_PROMPT` contains the model-facing API reference generated from the same definitions. This controls the application APIs Pulsar exposes; frontend JavaScript execution itself is not an operating-system isolation boundary.

The model does not receive one AI SDK tool per capability. `codeAct` is the only model tool; Feature APIs, Plugin APIs, ask-user interaction, registered Skill/MCP extensions, Plugin `ctx.tools`, and lazy `ctx.containers` retrieval are ordinary functions in the merged environment. CodeAct returns either the function's value or a structured error to the model.
