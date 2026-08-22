const config = await imports("@/config.json");
const useStreamText = Boolean(config.useStreamText?.value);
const messages = [
  ...bootstrapMessages,
  ...await imports("./default.chat.json"),
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
