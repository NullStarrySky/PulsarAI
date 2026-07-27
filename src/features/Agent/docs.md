# Agent

`Agent` owns the built-in AI SDK `ToolLoopAgent`, its built-in tools, and the registry used by Skill and MCP integrations.

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
