# 内置插件

`generate.js` 是默认生成入口，并由 `generatePath` 插槽中的已选资源确定。`runWorld()` 总是以具体消息版本的重放树组装 `ctx`；Conversation 不复制资源环境。`ctx` 包含 `conversationId`、`chat`、`conversation`、`input`、绑定的 `container`/`message`、`reply`、来源作用域的文件 API、插槽和 Agent。`reply` 就是当前 `ChatMessage`，读取或后处理时直接访问、赋值其字段。本地文件位于 `/`，共享来源位于 `/global/<source-folder>/`；脚本中的 `@/`、`./`、`../` 都相对当前来源文件解析。`tools/<name>/tool.js` 直接提供 `ctx[name]`。通过 `await parse(slot.paths("CTX_BUILD"), ctx)` 构建上下文，再创建 `new agent.ToolLoopAgent({ container: reply })`。调用 `await runner.stream({ messages })` 后，Agent 包装器自动准备模型，并直接写入模型名、流式正文与 thinking 步骤。

`action/goal.js` 与 `action/process.js` 也必须使用同一包装器。前者维护无提示词的 `goal/goal.data`，后者读取并推进它；不得手写 AI SDK 流循环或调用 `agent.prepare()`。
