# Sandbox

`Sandbox` owns controlled frontend JavaScript execution and macro expansion helpers for generation-time text.

Core exports live in `sandbox.ts`:

- `runSandbox` returns `{ ok, value, error }` for external callers that should not handle thrown exceptions.
- `executeSandboxCode` and `executeSandboxCodeAsync` execute snippets against merged environment objects.
- `createSandboxFunction` compiles one function expression without invoking it immediately, then preserves the authorized scope for later Plugin custom-tool calls.
- Agent CodeAct validates that model-generated source is one function with an explicit `return`, then delegates execution to `executeSandboxCodeAsync`.
- `resolveSandboxText` expands `{{ ... }}` inline macros.
- `resolveSandboxMessages` expands message arrays and preserves AI SDK message roles where possible.
- `mergeSandboxEnvironments` remains available for non-Plugin callers that intentionally compose explicit environment fragments.

Plugin resources are not merged into the Sandbox. Plugin and context-document compilation inject one source-scoped `imports` facade, then call Sandbox with the always-available public Feature APIs, active conversation values, hydrated `.data` state, and process helpers. `resolveSandboxMessages` continues to preserve roles when `[[...]]` splices message arrays.

The sandbox is intentionally frontend-side and minimal. Future plugin work should add explicit helpers to the environment object rather than widening global access.

Dangerous browser globals remain exceptional methods of the `globals` capability. Direct identifiers that can perform network access, persist browser data, control page/navigation, create workers, or dynamically compile code resolve through a scoped Proxy. `window`, `self`, and `globalThis` expose the same filtered view.

Ordinary globals such as language built-ins, `console`, timers, animation helpers, URL parsing, text encoding, and `crypto` remain available without a grant. Values explicitly injected into the Sandbox environment always take precedence. The controlled list is intentionally small and explicit rather than treating every browser global as a permission.

This Proxy boundary is intended to prevent accidental ambient browser access and make authorization failures explicit. It is not a hostile-code security boundary: JavaScript reflection and constructor chains cannot be comprehensively isolated inside the same browser realm. Untrusted external scripts must still remain disabled until the user reviews and authorizes them.

`Capabilities` supplies the default base environment. Public Feature objects are always available at both `<featureId>` and `capabilities.<featureId>`; `read_docs(featureId?, apiName?)` retrieves their shared contracts on demand. With no arguments it returns the Feature directory, with `featureId` the full definition, and with both arguments a single contract or `null`. Centrally blocked special methods are absent from the runtime object. Frontend JavaScript execution itself is not an operating-system isolation boundary.

The model does not receive one AI SDK tool per capability. `codeAct` is the only model tool; Feature APIs, Plugin APIs, ask-user interaction, registered Skill/MCP extensions, Plugin `ctx.tools`, and pure `ctx.containers` list/read operations are ordinary functions in the merged environment. CodeAct returns either the function's value or a structured error to the model.
