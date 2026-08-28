# 内置插件

`generate.js` 是唯一生成入口。Plugin `run()` 先以具体消息版本调用 `ctxbuilder(ctx, { chat, conversation, role, input, message, plugin, toolFunction })`，再执行此脚本；Conversation 不组装 Plugin 环境。`ctx` 已包含 `conversationId`、`roleId`、`pluginId`、`chat`、`conversation`/`conversations`、`role`/`roles`、`input`、绑定的 `container`/`message`、`reply`、文件 API、插槽和 Agent。`tools/<name>/tool.js` 直接提供 `ctx[name]`，其 `prompt.md` 自动进入 `toolFunction` 插槽。通过 `await parse(slot.paths("CTX_BUILD", "global"), ctx)` 构建上下文，再创建 `new agent.ToolLoopAgent({ container: reply })`。调用 `await runner.stream({ messages })` 后，Agent 包装器自动准备模型、写入模型名、流式正文与 thinking 步骤，并完成生命周期校验。脚本不以返回值传递正文；流结束后仍可读取完整正文并用 `reply.setContent()` 覆盖为后处理结果。

`action/goal.js` 与 `action/process.js` 也必须使用同一包装器。前者维护无提示词的 `goal/goal.data`，后者读取并推进它；不得手写 AI SDK 流循环或调用 `agent.prepare()`。
