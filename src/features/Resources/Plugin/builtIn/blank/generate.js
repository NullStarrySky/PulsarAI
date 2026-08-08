const wait = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

await reply.setModelName("blank-plugin/mock-stream");
await reply.setContent("");
await reply.addStep({
  name: "mock:start",
  message: "开始模拟流式消息写入。",
});

for (const chunk of [
  "这是空白插件生成的模拟回复。\n\n",
  "它没有调用任何模型 API，",
  "只通过 `reply.appendContent()` ",
  "分段写入当前空消息容器。\n\n",
  "如果你能逐段看到这些内容，说明消息写入和持久化链路正常。",
]) {
  await reply.appendContent(chunk);
  await wait(240);
}

await reply.addStep({
  name: "mock:finish",
  message: `模拟完成，最终正文长度 ${reply.read().message.content.length}。`,
});
