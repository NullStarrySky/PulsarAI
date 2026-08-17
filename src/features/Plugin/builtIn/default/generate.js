const messages = [...bootstrapMessages, ...compileChat(imports("./default.chat.json"))];
const runner = new agent.ToolLoopAgent({ container: reply });
await runner.stream({ messages });
