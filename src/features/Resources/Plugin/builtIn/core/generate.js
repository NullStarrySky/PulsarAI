const threshold = Number(config.get("generation", "compressionThreshold")) || 0;
const useStreamText = Boolean(config.get("generation", "useStreamText"));
const history = (await memory.prepare({ compressionThreshold: threshold })).messages;
const messages = [
  ...bootstrapMessages,
  ...compileChat(imports("./default.chat.json"), { chat: history, CHAT: history }),
];

if (useStreamText) {
  await agent.streamText({ container: reply, messages });
} else {
  const runner = new agent.ToolLoopAgent({ container: reply });
  await runner.stream({ messages });
}

// 流结束后可读取完整正文，执行正则或其它后处理，再用 setContent 写回。
// const processed = process(reply.read().message.content);
// await reply.setContent(processed);
