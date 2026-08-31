---
title: 运行环境
description: Sandbox 中可用的上下文、宏解析、草稿、回复与工具函数
---

# 运行环境

宏、Plugin JavaScript、自定义工具和 CodeAct 都在同一种环境对象中求值。生成时 `ctx` 指向环境本身。

## 上下文字段

| 字段 | 类型/含义 |
| --- | --- |
| `conversationId` | 当前 Conversation 的稳定 ID |
| `conversation` | 当前 Conversation 记录 |
| `packageId` | 当前角色包稳定 ID |
| `package` | 当前角色包记录，找不到时为 `null` |
| `containerId` | 当前助手消息容器 ID |
| `activePath` | 当前活动消息容器路径 |
| `chat`, `CHAT` | 活动路径编译出的模型消息数组 |
| `prompt` | 当前生成请求的用户输入文本 |
| `action` | 当前命令/动作名称，没有时为空字符串 |
| `now` | `() => string`，返回 ISO 时间 |
| `ctx` | 环境对象自身；Conversation 最终装配后可用 |

这些对象是当前生成的内存视图。不要直接修改它们来伪造持久化；使用对应 API。

## 宏解析

```ts
resolveText(text: string): Promise<string>
resolveMessages(messages: ModelMessage[]): Promise<ModelMessage[]>
```

双花括号表达式把结果转换为字符串。数组和 Set 默认逐项换行连接，`null`/`undefined` 变为空字符串。

双方括号表达式用于消息撕裂：返回模型消息数组时直接展开；返回字符串数组或 `Set<string>` 时继承父消息角色并展开；其它值按普通文本写入。

解析器逐轮处理嵌套宏，默认最多 30 轮。异步版本检测重复文本/消息状态并写入日志；循环或达到上限时保留最后一次结果。

## 资源与文件函数

以下函数同时存在于顶层和 `fs` 对象中（`import` 在顶层名为 `imports`）：

```ts
read(path: string): string | ArrayBuffer
write(path: string, content: string | ArrayBuffer): void
edit(path: string, find: string, replace: string): void
ls(path?: string): ResourceMeta[]
exists(path: string): boolean
mkdir(path: string): void
move(from: string, to: string): void
remove(path: string): void
imports(path: string | string[], env?: object): unknown | Promise<unknown>
```

完整行为见 [Plugin 资源 API](/api/resources)。

## 插槽

```ts
slot.list(scope?: "local" | "global"): SlotQuery[]
slot.get(id: string, scope?: "local" | "global"): SlotQuery | null
slot.paths(id: string, scope?: "local" | "global"): string[]
slot.import(id: string, scope?: "local" | "global"): string[]
```

`slot.import` 当前是 `slot.paths` 的别名，两者同步返回 World 绝对路径数组，并不导入内容。

## 草稿 input

```ts
input.read(): string
input.write(content: string): Promise<void>
input.edit(find: string, replace: string): Promise<string>
input.send(): Promise<{ id: string; content: string } | null>
```

`read` 读取未发送草稿。`write` 与 `edit` 乐观更新并异步持久化；`edit` 只替换第一次匹配，空 `find` 或找不到文本会抛错。

`send` 去除首尾空白；空草稿返回 `null`。成功时创建 user 消息容器、推进 `lastContainerId` 并清空草稿。草稿在 `send` 前不属于历史。

## 回复 reply

`reply` 只在 Conversation 已创建有效助手容器后提供：

```ts
reply.read(): { container: ChatMessageContainer; message: ChatMessage }
reply.setContent(content: string): Promise<void>
reply.clear(): Promise<void>
reply.appendContent(delta: string): Promise<void>
reply.addPart(part: AdditionalPart): Promise<void>
reply.addStep(step: ThinkingStep | ToolCallStep | ToolCallResult): Promise<void>
reply.updateThinking(id: string, content: string): Promise<void>
reply.completeToolCall(result: ToolCallResult): Promise<void>
reply.setModelName(modelName: string): Promise<void>
reply.fail(reason: string): Promise<void>
```

Agent 包装器通常自动调用流式与步骤方法。生成脚本可在流结束后用 `read()` 取得完整正文，再通过 `setContent()` 做后处理。`fail()` 把消息改为可见 error 并统一添加 `[ERROR]` 前缀。

## UI 控制

```ts
open(path: string): UiTargetState
close(path: string): UiTargetState
toggle(path: string): UiTargetState
```

文件路径操作资源编辑器；World 挂载路径使用 `/self/` 或 `/global/<pluginId>/`。返回值包含 `open`、`kind`、`pluginId`、`path`，文件目标另含 `resourceId`。

## 内置文档

```ts
read_docs(): string[]
read_docs(id: "package" | "plugin" | "conversation"): string
read_docs(id: string): string | null
```

无参数时返回文档 ID；传入 ID 时同步返回原始 Markdown。文档按需读取，不常驻系统上下文。

## Agent、工具与日志

```ts
agent.ToolLoopAgent
agent.streamText(...)
agent.askUser(...)
AGENT // agent 的别名
utils.yaml.extract(...)
logger.logs
```

详细规则见 [Agent 与 CodeAct](/api/agent)。

::: warning 当前边界
内置 Agent 指令中预留了 `generate(...)` 与 `ctx.tools[name]` 的使用约定，但当前 `buildPluginGenerationEnvironment()` 没有装配这两个字段。它们不是现在可调用的 API，补齐实现与测试前不应在 Plugin 脚本中使用。
:::

## 条件辅助函数

```ts
include(keywordOrRegex: unknown, depth?: number): boolean
exclude(keywordOrRegex: unknown, depth?: number): boolean
probability(percentage: unknown): boolean
containKeyWord // include 的别名
excludeKeyWord // exclude 的别名
```

`createPluginConditionEnvironment()` 能创建以上对象：字符串形如 `/pattern/flags` 时按正则处理，否则不区分大小写搜索消息文本；`depth` 为正数时只检查最后若干条消息。

当前主生成环境没有自动合并该辅助对象。资源条件只保证在调用 `imports(path, environment)` 时获得显式传入的环境及 logger；不要把以上名字视为无条件存在的全局 API。

## 同步规则

| 同步 | 异步 |
| --- | --- |
| 路径解析、read、ls、exists、插槽查询 | JavaScript 资源 import |
| Overlay write/edit/mkdir/move/remove | resolveText / resolveMessages |
| read_docs、open/close/toggle | input 持久化与 send |
| 条件表达式 | Agent、模型、Host、网络、数据库 |

不要为了统一写法给同步 API 添加无意义的 `await`，也不要把异步持久化结果混进同步领域状态。
