---
title: Agent 与 CodeAct
description: 唯一模型工具、Agent 包装器、回复容器和 Overlay 事务
---

# Agent 与 CodeAct

PulsarAI 的模型工具面只有 `codeAct`。其它能力作为统一环境中的函数被 CodeAct 调用，不注册为平行 AI SDK tools。

## codeAct 输入

接受普通函数、async function 或带代码块的箭头函数。函数必须显式包含 `return`：

```js
async function () {
  const docs = read_docs("plugin");
  const paths = slot.paths("document", "global");
  return { docs, paths };
}
```

直接表达式或缺少 return 的函数无效。

## codeAct 输出

```ts
type CodeActResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };
```

返回值会转换为可序列化数据：Date 变 ISO 字符串，bigint 变字符串，非有限 number 变字符串，函数和 symbol 不进入对象字段，循环引用变为 `[Circular]`。

## 事务

Conversation 在每次 CodeAct 前调用 Overlay `begin()`：

- 得到 `{ ok: true }` 后 `commit()`；
- 验证失败、执行错误或 `{ ok: false }` 时 `rollback()`；
- 一次函数中的 write/edit/mkdir/move/remove 要么全部保留，要么全部恢复。

不要在单次调用内部吞掉错误后返回成功，除非确实希望提交此前操作。

## Agent provider

```ts
interface AgentResourceProvider {
  ToolLoopAgent: new (input: {
    container: AgentOutputContainer;
  }) => {
    stream(input: { messages: ModelMessage[] }): Promise<void>;
  };

  streamText(input: {
    container: AgentOutputContainer;
    messages: ModelMessage[];
  }): Promise<void>;

  askUser(input: {
    question: string;
    options?: Array<string | { label: string; value?: string }>;
  }): Promise<unknown>;
}
```

默认生成流程：

```js
const messages = await resolveMessages(imports(slot.paths("chat", "global")));
const runner = new agent.ToolLoopAgent({ container: reply });
await runner.stream({ messages });
```

`ToolLoopAgent` 支持多步 CodeAct 循环，当前默认最多 8 步。`agent.streamText` 适合不需要工具循环的单次正文生成。

## 输出容器

Agent 不返回正文给生成脚本，而是把正文和步骤写入绑定的 `reply`。包装器自动记录模型名、逐段追加正文、创建 thinking，并把 tool-call 完成为 tool-result。

流结束后仍可读取全文并后处理：

```js
await runner.stream({ messages });
const current = reply.read().message.content;
await reply.setContent(postprocess(current));
```

## 预留的自定义工具约定

Plugin 只发现直接位于 `tools/<name>/` 下并同时拥有以下两个文件的工具：

```text
tools/example/tool.js
tools/example/prompt.md
```

设计约定要求 `tool.js` 只包含一个函数，按 order 与稳定资源键排序，并通过 `ctx.tools.example(...args)` 调用。

::: warning 尚未装配
当前 `buildPluginGenerationEnvironment()` 没有发现工具或创建 `ctx.tools`，因此以上目录只是保留约定，不是当前可调用 API。实现后，自定义工具仍应作为 CodeAct 环境函数，而不是额外模型工具。
:::

## askUser

```js
return await agent.askUser({
  question: "选择处理方式",
  options: [
    { label: "覆盖", value: "replace" },
    { label: "保留", value: "keep" }
  ]
});
```

没有 UI requester 时返回 `{ cancelled: true }`。只有真实用户决策会改变结果时才应调用。

## 预留的子 Agent 约定

内置 prompt 约定环境可提供：

```ts
generate(input: {
  plugin?: string;
  environment?: string;
  prompt: string;
}): Promise<string>
```

内置 prompt 描述了以上调用形式，但当前生成环境没有装配 `generate`。在实现对应生命周期、临时 Conversation 和测试前，它不是可调用 API。

## 统计与日志

最终消息版本的 `resourceUpdate.stats` 记录 create/edit/move/remove 数量、CodeAct attempted/committed/rolledBack 和日志数。

宏轮次、import、条件、文件 API 和错误写入 `PluginLogger`，不会混进模型 thinking。消息步骤只持久化 thinking 和工具调用/结果。
