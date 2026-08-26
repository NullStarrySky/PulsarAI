---
title: API 文档
description: PulsarAI Sandbox、Plugin、Agent、Conversation 与 Host 的人类可读参考
---

# API 文档

这套参考描述当前代码真正提供的调用面，不描述规划中的能力，也不生成一份脱离架构的 Feature 清单。

API 分为两个层级：

- **Plugin/Sandbox API**：供生成脚本、宏、插入条件、自定义工具与 CodeAct 使用。
- **Renderer Host API**：供 `src/features` 中的应用代码通过 `@/host` 调用数据库、原生平台和网络能力。

Plugin 代码不能直接调用 Host；Renderer Feature 也不应绕过 `@/host` 导入 Electron、Tauri 或其插件。

## 最小生成脚本

主 Plugin 必须有一个 JavaScript 文件注册到 `generatePath` 插槽：

```js
const raw = imports(slot.paths("chat", "global"));
const messages = await resolveMessages(raw);

const runner = new agent.ToolLoopAgent({ container: reply });
await runner.stream({ messages });
```

插槽返回路径，`imports` 包装资源，Sandbox 递归解析消息，Agent 只向绑定的 `reply` 写入结果。

## CodeAct 示例

模型只看到一个 `codeAct` 工具。工具输入必须是一个含显式 `return` 的函数：

```js
async function () {
  const files = ls("@/");
  const note = read("@/notes/today.md");
  return { files, note };
}
```

成功结果为 `{ ok: true, value }`；验证失败或运行错误为 `{ ok: false, error }`。本次函数产生的 Overlay 操作随结果一起提交或回滚。

## 文档地图

- [运行环境](/api/environment)：宏、上下文字段、文件函数、草稿、回复、日志与同步规则。
- [Plugin 资源 API](/api/resources)：路径、文件操作、import 包装、插槽及约定文件格式。
- [Agent 与 CodeAct](/api/agent)：唯一模型工具、Agent 包装器、reply 和事务。
- [Host API](/api/host)：Renderer 的跨平台原生能力 facade。
- [核心类型](/api/types)：Package、Conversation、消息、Plugin 与 Overlay 的持久化契约。

## API 稳定性

`host/index.ts` 是 Renderer 的稳定跨平台 facade；Plugin 侧的顶层环境字段、文件 API 和插槽 API 是生成脚本的主要契约。

项目尚未发布，因此内部实现和数据结构可以直接修改，不承诺旧版本兼容。文档描述的是当前仓库状态；遇到差异时，以类型定义和调用者为准，并同步修正文档。
