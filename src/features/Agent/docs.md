# Agent

`Agent` supplies the AI SDK `ToolLoopAgent` constructor and a lazy `prepare()` provider for the hydrated model, built-in tools, lifecycle hooks, and the registry used by Skill and MCP integrations. It does not own the conversation's main process; the editable built-in Plugin workflow decides whether and how to construct the Agent.

## Project Agent

The workspace empty state asks for an existing character package or creates a new package before persisting the first conversation. The user also chooses whether the conversation is a normal `chat` or a project `task`. There is no built-in character package.

`application/project-agent-runtime.ts` binds a filesystem-shaped `project` API to that conversation. It resolves the selected project on every call, so `project.select(projectId)` can safely change the target for later operations. The API can list/read/create/write/move/remove project conversations and project-local plugin nodes, but cannot modify global plugins, built-in plugins, or another package.

For package-bound `task` conversations, Conversation calls `createProjectAgentRuntime` directly and adds `PROJECT_AGENT_PROMPT` to the normal generation context. The prompt combines:

- selected-project identity and API signatures;
- inspect-before-write and read-back guidance;
- role-playing architecture guidance for identity, setting, relationships, voice, goals, boundaries, continuity, context assembly, and interaction rules;
- the current `.imd` data definition from `InteractiveDoc/domain/interactive-document-format.ts`.

The task then enters the same selected Plugin workflow as ordinary conversations. Project operations are performed through the existing sandboxed `executeJavaScript` tool.

`createProjectAgentRuntime` adds three synchronized documentation blocks to the project prompt:

- Project filesystem API operations for `/project.json`, `/conversations`, and `/plugins`;
- authorized Plugin Feature API documentation generated from the shared Plugin capability definition;
- the InteractiveDocument format prompt.

This keeps the model-facing Plugin API inventory aligned with `Plugin/domain/plugin-capability.ts`, its capability builder, and VitePress instead of maintaining another handwritten signature list.

## Side tasks

Right-sidebar tasks use the same project-Agent runtime. They are `task` conversations stored in the related character package and persist a `binding` containing the project package, workspace resource type/id, concrete Project API path, and resource title. The merged Task panel also creates bound conversations; plugin resources create `test` conversations instead.

When the host conversation has this context, the runtime adds the bound path to the prompt and exposes it as `PROJECT_RESOURCE_PATH`. The Agent inspects that path first and remains scoped to it unless the user broadens the request.

## Built-in tools

- `application/default-agent.ts` exposes the constructor immediately and hydrates the selected chat model, built-in/registered tools, stop condition, and lifecycle hooks only after a plugin process calls `agent.prepare()`. It does not call `new ToolLoopAgent`.
- `application/ask-user-tool.ts` defines the `askUser` Zod schema and normalizes UI results. The model supplies one question and 1-8 predefined options.
- `application/agent-extension-registry.ts` adds Skill and MCP tools to the same agent. It does not create another conversation-generation path.

## Ask-user interaction

Conversation generation gives the Agent resource set an ask-user requester backed by the existing generation-component dialog. The tool awaits that requester inside its `execute` function, so the current agent step remains pending until the user responds.

`presentation/AskUserComponent.vue` renders the question followed by the predefined options. Its final option is always `自由回复`, which opens a text dialog. Both predefined and custom answers resolve to:

```ts
{
  answer: string;
  source: "option" | "custom";
  optionLabel?: string;
}
```

Closing the question resolves the tool with `{ cancelled: true }`. The component is registered as `agent.ask-user` by `presentation/register-agent-generation-components.ts`.
