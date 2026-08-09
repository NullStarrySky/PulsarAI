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
  "这是",
  "空白插件",
  "生成的",
  "一段更长、",
  "更快，",
  "也切得更细的",
  "模拟流式回复。\n\n",
  "它不会调用",
  "任何模型 API，",
  "而是持续通过 ",
  "`reply.appendContent()` ",
  "把很小的文本片段",
  "写入当前的",
  "空白助手消息。\n\n",
  "现在你应该能看到",
  "文字以更密集的节奏",
  "逐步出现，",
  "同时正文长度、",
  "消息版本、",
  "过程步骤",
  "以及持久化状态",
  "都在同一条回复上",
  "连续更新。\n\n",
  "这段内容故意写得更长，",
  "方便检查自动滚动、",
  "消息工具栏、",
  "时间与楼层标识、",
  "Markdown 渲染",
  "和流式写入时",
  "界面是否保持稳定。",
]) {
  await reply.appendContent(chunk);
  await wait(65);
}

await reply.addStep({
  name: "mock:finish",
  message: `模拟完成，最终正文长度 ${reply.read().message.content.length}。`,
});
