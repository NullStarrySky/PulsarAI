# Agent

`Agent` owns the built-in AI SDK `ToolLoopAgent`, its built-in tools, and the registry used by Skill and MCP integrations.

## Project Agent

The workspace empty state starts a temporary-looking conversation owned by the immutable `PulsarAI` character package. Selecting a normal character package stores its id on the created conversation as `projectPackageId`; the conversation itself remains under the built-in package.

`application/project-agent-runtime.ts` binds a filesystem-shaped `project` API to that conversation. It resolves the selected project on every call, so `project.select(projectId)` can safely change the target for later operations. The API can list/read/create/write/move/remove project conversations and project-local plugin nodes, but cannot modify global plugins, built-in plugins, or another package.

The built-in package-local `项目 Agent` plugin supplies the highest-priority `context.imd`. Its system block injects `PROJECT_AGENT_PROMPT`, which combines:

- selected-project identity and API signatures;
- inspect-before-write and read-back guidance;
- role-playing architecture guidance for identity, setting, relationships, voice, goals, boundaries, continuity, context assembly, and interaction rules;
- the current `.imd` data definition from `InteractiveDoc/domain/interactive-document-format.ts`.

The plugin leaves `generation.js` empty, so project conversations use the same AI SDK `ToolLoopAgent` as ordinary conversations. Project operations are performed through the existing sandboxed `executeJavaScript` tool.

## Built-in tools

- `application/default-agent.ts` hydrates the selected chat model, assembles built-in and registered extension tools, and runs one multi-step agent loop.
- `application/ask-user-tool.ts` defines the `askUser` Zod schema and normalizes UI results. The model supplies one question and 1-8 predefined options.
- `application/agent-extension-registry.ts` adds Skill and MCP tools to the same agent. It does not create another conversation-generation path.

## Ask-user interaction

Conversation generation gives the default Agent an ask-user requester backed by the existing generation-component dialog. The tool awaits that requester inside its `execute` function, so the current agent step remains pending until the user responds.

`presentation/AskUserComponent.vue` renders the question followed by the predefined options. Its final option is always `自由回复`, which opens a text dialog. Both predefined and custom answers resolve to:

```ts
{
  answer: string;
  source: "option" | "custom";
  optionLabel?: string;
}
```

Closing the question resolves the tool with `{ cancelled: true }`. The component is registered as `agent.ask-user` by `presentation/register-agent-generation-components.ts`.
