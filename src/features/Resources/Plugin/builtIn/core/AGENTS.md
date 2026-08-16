# 内置插件

`generate.js` 是唯一生成入口。它显式读取上下文资源、选择压缩结果并创建 `new agent.ToolLoopAgent({ container: reply })`；Conversation 不替它组装上下文。调用 `await runner.stream({ messages })` 后，Agent 包装器自动准备模型、写入模型名、流式正文与 thinking 步骤，并完成生命周期校验。脚本不以返回值传递正文；流结束后仍可读取完整正文并用 `reply.setContent()` 覆盖为后处理结果。

`action/goal.js` 与 `action/process.js` 也必须使用同一包装器。前者维护无提示词的 `goal/goal.data`，后者读取并推进它；不得手写 AI SDK 流循环或调用 `agent.prepare()`。
