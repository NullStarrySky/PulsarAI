const threshold = Number(imports.config.local("generation", "compressionThreshold")) || 0;
const history = (await memory.prepare({ compressionThreshold: threshold })).messages;
const messages = [
  ...bootstrapMessages,
  ...compileChat(imports.resource("./default.chat.json"), { chat: history, CHAT: history }),
];
const runtime = await agent.prepare();
const runner = new agent.ToolLoopAgent({
  model: runtime.model,
  reasoning: runtime.reasoning,
  allowSystemInMessages: true,
  instructions: runtime.instructions,
  tools: runtime.tools,
  stopWhen: runtime.stopWhen,
  onStepStart: runtime.onStepStart,
});
try {
  await reply.setModelName(runtime.modelName);
  const result = await runner.stream({ messages });
  let thinking = "";
  for await (const part of result.stream) {
    if (part.type === "text-delta") {
      await reply.appendContent(part.text);
    } else if (part.type === "reasoning-start") {
      thinking = "";
    } else if (part.type === "reasoning-delta") {
      thinking += part.text;
    } else if (part.type === "reasoning-end" && thinking.trim()) {
      await reply.addStep({ name: "thinking", message: thinking });
      thinking = "";
    } else if (part.type === "error") {
      throw part.error instanceof Error ? part.error : new Error(String(part.error));
    } else if (part.type === "abort") {
      throw new Error(part.reason || "生成已中止。");
    }
  }
  if (thinking.trim()) {
    await reply.addStep({ name: "thinking", message: thinking });
  }

  // 流结束后可读取完整正文，执行正则或其它后处理，再用 setContent 写回。
  // const processed = process(reply.read().message.content);
  // await reply.setContent(processed);
} finally {
  await runtime.finish();
}
