# Agent

`Agent` supplies the AI SDK `ToolLoopAgent` constructor and a lazy `prepare()` provider for the hydrated model, the current conversation reasoning level, the single CodeAct tool, lifecycle hooks, and the registry used by Skill and MCP integrations. It does not own the conversation's main process; the editable built-in Plugin workflow decides whether and how to construct the Agent.

## CodeAct

- `application/default-agent.ts` exposes the constructor immediately, forces `allowSystemInMessages: true`, and hydrates the selected chat model, one `codeAct` tool, stop condition, lifecycle hooks, and conversation reasoning level only after a plugin process calls `agent.prepare()`. It does not call `new ToolLoopAgent`.
- The conversation-bound constructor supplies the current AI SDK top-level `reasoning` default even to persisted process scripts created before the setting existed. `agent.prepare()` also returns it as `runtime.reasoning`, so current built-in and custom processes can pass it explicitly.
- `application/code-act.ts` accepts only one JavaScript function with an explicit `return`, executes it against the authorized Sandbox environment, and returns either `{ ok: true, value }` or `{ ok: false, error }`.
- CodeAct input has an optional `intent`. Ordinary `action` calls use the authorized runtime environment; synchronous `variable-update` calls receive only the transactional Data container with `readForResource` and `writeForResource`. They cannot use Feature/Plugin APIs, network/files, detached async work, current time, or randomness. When the context has no updater-enabled `.data` instance, `variable-update` succeeds as a no-op. Actual update errors return to the ToolLoopAgent for correction, the third consecutive failure throws, and `runtime.finish()` rejects if the model abandons an unresolved update error.
- `application/ask-user-tool.ts` retains the `askUser` Zod schema and result normalization, but ask-user is now `agent.askUser(...)` / `api.askUser(...)` inside CodeAct rather than a second model tool.
- `application/agent-extension-registry.ts` keeps Skill and MCP registrations behind `agent.callExtension(...)`, `skills.call(...)`, and `mcp.call(...)`. Registered extensions no longer expand the model-visible tool list.
- Plugin `tools/<name>/tool.js` functions also stay out of the AI SDK tool set. Conversation injects their `prompt.md` contracts into a `# 自定义工具` context block and exposes the compiled functions through `ctx.tools[name](...args)` inside CodeAct.
- Pure Plugin containers may be inspected and read through `ctx.containers`; Skill execution remains in the Agent extension registry rather than being adapted into a container.

## Ask-user interaction

Conversation generation gives the CodeAct environment an ask-user requester backed by the existing generation-component dialog. The CodeAct function awaits that requester, so the current agent step remains pending until the user responds.

`presentation/AskUserComponent.vue` renders the question followed by the predefined options. Its final option is always `自由回复`, which opens a text dialog. Both predefined and custom answers resolve to:

```ts
{
  answer: string;
  source: "option" | "custom";
  optionLabel?: string;
}
```

Closing the question resolves the tool with `{ cancelled: true }`. The component is registered as `agent.ask-user` by `presentation/register-agent-generation-components.ts`.
