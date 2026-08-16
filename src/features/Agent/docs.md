# Agent

The registered `agent.ask-user` generation component composes the shadcn-vue Questionnaire form, item, and choice primitives for predefined answers while retaining an explicit freeform-answer dialog. Resolving a choice continues through the Conversation generation-component requester; it does not introduce a second model tool.

`Agent` supplies a Conversation-bound wrapper around the AI SDK `ToolLoopAgent`. Plugins construct it with `new agent.ToolLoopAgent({ container: reply })` and call `await runner.stream({ messages })`; the wrapper lazily prepares the hydrated model, applies the current reasoning level and single CodeAct tool, writes the model name/text/thinking steps into that output container, propagates stream failures, and finishes lifecycle validation. It does not own the conversation's main process; the editable built-in Plugin workflow decides which messages to pass.

## CodeAct

- `runtime/default-agent.ts` exposes the wrapper constructor immediately. Passing `container: reply` is required; its `stream({ messages })` method forces `allowSystemInMessages: true`, lazily hydrates the selected chat model, and passes exactly the JavaScript-executing `codeAct` tool through both `tools` and `activeTools`, along with the stop condition and current reasoning level. It then fills the supplied reply container automatically. Model preparation remains internal to that wrapper.
- The wrapper supplies the current AI SDK top-level `reasoning` value to every concrete SDK agent and streams reasoning deltas into one persisted thinking step per SDK reasoning block. It also persists each streamed CodeAct call immediately, then its result or error. Lifecycle and hook events are deliberately not message steps, so Plugin scripts must not hand-roll stream consumption.
- `runtime/code-act.ts` accepts only one JavaScript function with an explicit `return`, executes it against the authorized Sandbox environment, and returns either `{ ok: true, value }` or `{ ok: false, error }`.
- Every CodeAct call runs inside one Conversation resource-overlay transaction. Plugin `write/edit/mkdir/move/remove/config.set` and writable `.data` wrapper or `data.writeForResource(...)` operations share that transaction: `{ ok: true }` commits their ordered operations to the current message version, while a returned error or thrown exception restores both files and Data state. CodeAct has no separate variable-update intent.
- `runtime/ask-user-tool.ts` retains the `askUser` Zod schema and result normalization, but ask-user is now `agent.askUser(...)` / `api.askUser(...)` inside CodeAct rather than a second model tool.
- `runtime/agent-extension-registry.ts` keeps Skill and MCP registrations behind `agent.callExtension(...)`, `skills.call(...)`, and `mcp.call(...)`. Registered extensions no longer expand the model-visible tool list.
- Plugin `tools/<name>/tool.js` functions also stay out of the AI SDK tool set. Conversation injects their `prompt.md` contracts into a `# 自定义工具` context block and exposes the compiled functions through `ctx.tools[name](...args)` inside CodeAct.
- Pure Plugin containers may be inspected and read through `ctx.containers`; Skill execution remains in the Agent extension registry rather than being adapted into a container.

## Ask-user interaction

Conversation generation gives the CodeAct environment an ask-user requester backed by the existing generation-component dialog. The CodeAct function awaits that requester, so the current agent step remains pending until the user responds.

`components/AskUserComponent.vue` renders the question followed by the predefined options. Its final option is always `自由回复`, which opens a text dialog. Both predefined and custom answers resolve to:

```ts
{
  answer: string;
  source: "option" | "custom";
  optionLabel?: string;
}
```

Closing the question resolves the tool with `{ cancelled: true }`. The component is registered as `agent.ask-user` by `components/register-agent-generation-components.ts`.
