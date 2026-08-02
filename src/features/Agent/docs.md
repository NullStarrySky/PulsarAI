# Agent

`Agent` supplies the AI SDK `ToolLoopAgent` constructor and a lazy `prepare()` provider for the hydrated model, the current conversation reasoning level, the single CodeAct tool, lifecycle hooks, and the registry used by Skill and MCP integrations. It does not own the conversation's main process; the editable built-in Plugin workflow decides whether and how to construct the Agent.

## Project Agent

The workspace empty state asks for an existing character package or creates a new package before persisting the first conversation. The user also chooses whether the conversation is a normal `chat` or a project `task`. There is no built-in character package.

`application/project-agent-runtime.ts` binds a filesystem-shaped `project` API to that conversation. It resolves the selected project on every call, so `project.select(projectId)` can safely change the target for later operations. The API can list/read/create/write/move/remove project conversations and project-local plugin nodes, but cannot modify global plugins, built-in plugins, or another package.

For package-bound `task` conversations, Conversation calls `createProjectAgentRuntime` directly and adds `PROJECT_AGENT_PROMPT` to the normal generation context. The prompt combines:

- selected-project identity and API signatures;
- inspect-before-write and read-back guidance;
- role-playing architecture guidance for identity, setting, relationships, voice, goals, boundaries, continuity, context assembly, and interaction rules;
- the current `context.md` role-fence and metadata-bound `.data` definition from `InteractiveDoc/domain/interactive-document-format.ts`.

The task then enters the same selected Plugin workflow as ordinary conversations. Project operations are performed through the single sandboxed `codeAct` tool.

`createProjectAgentRuntime` adds three synchronized documentation blocks to the project prompt:

- Project filesystem API operations for `/project.json`, `/conversations`, and `/plugins`;
- authorized Plugin Feature API documentation generated from the shared Plugin capability definition;
- the context-document format prompt.

This keeps the model-facing Plugin API inventory aligned with `Plugin/domain/plugin-capability.ts`, its capability builder, and VitePress instead of maintaining another handwritten signature list.

## Side tasks

Right-sidebar tasks use the same project-Agent runtime. They are `task` conversations stored in the related character package and persist a `binding` containing the project package, workspace resource type/id, concrete Project API path, and resource title. The merged Task panel also creates bound conversations; plugin resources create `test` conversations instead.

When the host conversation has this context, the runtime adds the bound path to the prompt and exposes it as `PROJECT_RESOURCE_PATH`. The Agent inspects that path first and remains scoped to it unless the user broadens the request.

## CodeAct

- `application/default-agent.ts` exposes the constructor immediately, forces `allowSystemInMessages: true`, and hydrates the selected chat model, one `codeAct` tool, stop condition, lifecycle hooks, and conversation reasoning level only after a plugin process calls `agent.prepare()`. It does not call `new ToolLoopAgent`.
- The conversation-bound constructor supplies the current AI SDK top-level `reasoning` default even to persisted process scripts created before the setting existed. `agent.prepare()` also returns it as `runtime.reasoning`, so current built-in and custom processes can pass it explicitly.
- `application/code-act.ts` accepts only one JavaScript function with an explicit `return`, executes it against the authorized Sandbox environment, and returns either `{ ok: true, value }` or `{ ok: false, error }`.
- CodeAct input has an optional `intent`. Ordinary `action` calls use the authorized runtime environment; synchronous `variable-update` calls receive only the transactional Data container with `readForResource` and `writeForResource`. They cannot use Feature/Plugin APIs, network/files, detached async work, current time, or randomness. Errors return to the ToolLoopAgent for correction, the third consecutive failure throws, and `runtime.finish()` rejects if the model abandons an unresolved update error.
- `application/ask-user-tool.ts` retains the `askUser` Zod schema and result normalization, but ask-user is now `agent.askUser(...)` / `api.askUser(...)` inside CodeAct rather than a second model tool.
- `application/agent-extension-registry.ts` keeps Skill and MCP registrations behind `agent.callExtension(...)`, `skills.call(...)`, and `mcp.call(...)`. Registered extensions no longer expand the model-visible tool list.
- Plugin `tools/<name>/tool.js` functions also stay out of the AI SDK tool set. Conversation injects their `prompt.md` contracts into a `# 自定义工具` context block and exposes the compiled functions through `ctx.tools[name](...args)` inside CodeAct.
- Plugin lazy containers and registered Skills use the ordinary `ctx.containers` context API. Skills are exposed as the runtime-only `container:system/skills`; container retrieval never adds another AI SDK tool.

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
