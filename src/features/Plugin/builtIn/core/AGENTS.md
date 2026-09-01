# 内置插件

`generate.js` 是默认生成入口，并由 `/self/slot/generatePath` 契约中的已选资源确定。`runWorld()` 以具体消息版本组装 `ctx` 并执行该路径；Conversation 不复制资源环境。`ctx` 包含 `conversationId`、`chat`、`conversation`、`input`、绑定的 `container`/`message`、`reply`、文件 API、插槽和 Agent。World 的本地文件在 `/self/`，共享来源位于 `/global/<source-folder>/`；脚本内的 `@/` 始终指向当前来源根。`tools/<name>/tool.js` 直接提供 `ctx[name]`，其 `prompt.md` 自动进入 `toolFunction` 插槽。通过 `await parse(slot.paths("/self/slot/CTX_BUILD"), ctx)` 构建上下文，再创建 `new agent.ToolLoopAgent({ container: reply })`。调用 `await runner.stream({ messages })` 后，Agent 包装器自动准备模型、写入模型名、流式正文与 thinking 步骤，并完成生命周期校验。

`action/goal.js` 与 `action/process.js` 也必须使用同一包装器。前者维护无提示词的 `goal/goal.data`，后者读取并推进它；不得手写 AI SDK 流循环或调用 `agent.prepare()`。
