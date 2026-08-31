---
title: 系统设计概览
description: 从普通聊天到动态宏、Plugin、插槽、Overlay 与 CodeAct 的完整设计推导
---

# PulsarAI 系统设计概览

PulsarAI 的目标不是继续给聊天界面堆功能，而是用尽可能少的基础设施，构建一个足够灵活的提示词组装与 Agent 流程控制系统。

整个系统最终只依赖三种基本原语：

1. **资源**：Plugin 中有稳定路径和 ID 的文件。
2. **求值**：Sandbox 在统一环境对象中执行 JavaScript，并递归解析文本或消息宏。
3. **操作**：Conversation 把生成期间的资源变化记录为可重放、可回滚的 Overlay 操作。

Plugin、插槽、角色包、会话分支和 CodeAct 都是这三种原语的组合，而不是互不相干的子系统。

## 目标与取舍

PulsarAI 优先追求：

- 提示词、上下文和生成流程都可以由普通资源组合；
- 一个能力只实现一次，并在宏、JavaScript 和 Agent 中共享；
- 会话分支切换后，消息与资源状态同时回到正确版本；
- 平台差异停留在 Host 层，Renderer Feature 不感知 Electron 或 Tauri；
- 普通路径读取和内存操作保持同步，数据库持久化留在边界异步完成。

PulsarAI 不把 Plugin JavaScript 当作敌对代码。Sandbox 的主要目的，是提供统一求值环境、收敛可用对象并改善错误与日志，而不是建立强安全隔离。桌面 Renderer 与原生 Host 之间仍保持 Electron 的 context isolation、sandbox 和窄 preload bridge；这与 Plugin 运行时的信任模型是两件事。

## 从普通聊天推导到 PulsarAI

### 阶段 1：直接聊天

最简单的系统把 `chat` 原样发送给模型，再把模型回复追加回来。它没有扩展点，也没有独立的上下文构建过程。

### 阶段 2：系统提示词

系统在消息前加入一段固定 system prompt。用户可以改变模型行为，但所有上下文仍是一块不可组合的文本。

### 阶段 3：静态宏

系统提供日期、用户名或当前输入等固定占位符。静态宏改善复用，却要求核心程序提前认识每一种能力。

### 阶段 4：带参数的静态宏

宏开始接受参数，例如骰子表达式。宏系统逐渐变成一门独立语言：每增加控制流、嵌套、异步或对象访问，都要继续扩展解析器。

### 阶段 5：消息模板

上下文从一段字符串变为消息数组，并提供若干固定区段。它能表达 system/user/assistant 角色，却仍由核心系统预先规定“哪些区段存在、各区段如何求值”。

### 阶段 6：动态宏系统

PulsarAI 不继续发明静态宏语法，而是让宏内容直接成为统一环境对象中的 JavaScript。

- 双花括号宏把求值结果转换为文本并内联。
- 双方括号宏允许结果撕裂当前消息，把字符串数组或模型消息数组展开进消息序列。
- 宏可以异步执行，因此能够导入资源或调用环境 API。

示例：

```md
当前时间：{{ now() }}
角色资料：{{ imports("@/character/main.md") }}
```

```json
{
  "message": [
    { "role": "system", "content": "[[ chat ]]" }
  ]
}
```

这两种分隔符是系统仅有的静态求值语法。所有具体能力都来自环境对象，而不是继续扩展宏语言。

Sandbox 提供文本和消息两种递归解析器。解析器逐轮执行当前输入中的所有宏，直到内容不再变化、检测到重复状态，或达到轮次上限。每轮结果进入 `PluginLogger`；发生错误时，异常附带可定位的 Sandbox 源码片段。

### 阶段 7：动态宏与 Plugin 文件

只有宏仍然无法管理大量角色资料、世界设定、模板、脚本和媒体。PulsarAI 因此把资产统一放进 Plugin。

一个 Plugin 的持久化结构非常简单：

```ts
interface Plugin {
  files: PluginFile[];
  emptyFolders: string[];
}
```

文件保存稳定 ID、Plugin 相对路径、内容和插入元数据。非空目录和所有中间目录由路径推断；只有叶级空目录需要单独保存。这样文件系统不再维护互相重复的 `parentId`、`children`、完整路径和目录节点。

资源区分源码与 World 路径：

- `@/path`：仅在源码内表示当前源码所属 Plugin。
- `/self/path` 与 `/global/<plugin-id>/path`：World 绝对路径；根 `/config.json` 是共享契约与采用策略。

`read` 和 `import` 在返回文本前，会把其中的 `@/` 固定为文件所属 World 挂载的绝对路径。于是两个不同 Plugin 的文档即使都写了 `imports("@/detail.md")`，被同一插槽收集后仍各自指向正确资源。

`read` 返回原始文本或二进制；`import` 根据后缀包装恰好一个资源：Markdown 返回文本，chat 返回消息数组，data 返回 facade，JSON 返回对象，JavaScript 在环境中执行。

`import` **不负责递归宏解析**。调用者取得包装结果后，再把文本交给 `resolveText`，或把消息交给 `resolveMessages`。资源包装与递归求值因此各自只有一个职责。

### 阶段 8：动态宏、Plugin 与插槽

直接写死路径会让 Plugin 难以组合。插槽把“需要某类资源的位置”变成一个注册表：

```ts
interface PluginSlot {
  id: string;
  title: string;
  description: string;
  contentSuffixes: string[];
  selectionMode: "single" | "multiple" | "none";
}
```

全局插槽只由根 `/config.json` 预定义，且与 Plugin `slots.json` 的本地插槽保持同构。插槽没有父子关系；文件通过 `insertion.slot` 直接导出，并可附带同步 JavaScript 条件与独立排序值。运行时排除 `/config.json.disabled` 命中的文件或 Plugin 挂载，再按 `order`、Plugin ID、资源 ID 得到稳定顺序；`single` 只取得首个启用资源。

插槽 API 返回的是显式资源路径，而不是提前展开后的内容：

```js
const paths = slot.paths("chat", "global");
const rawMessages = imports(paths);
const messages = await resolveMessages(rawMessages);
```

路径数组保持了资源身份和来源作用域，也允许生成脚本决定何时导入、如何过滤、是否执行后处理。背景、命令、正则、聊天入口和生成入口都使用同一插槽机制。

### 阶段 9：会话树与资源 Overlay

Conversation 不是线性消息数组。每个消息容器保存父容器、当前选择的下一容器，以及多个可切换的消息版本。当前上下文由“活动分支 + 每个容器的活动消息版本”共同决定。

如果 Agent 直接修改基础 Plugin，切换分支时资源状态就无法跟随消息回退。PulsarAI 因此把生成期资源修改记录在具体消息版本上：

```ts
type ConversationResourceOperation =
  | { type: "edit"; /* ... */ }
  | { type: "create"; /* ... */ }
  | { type: "move"; /* ... */ }
  | { type: "remove"; /* ... */ }
  | { type: "configure"; /* complete World config */ };
```

生成前，Conversation 克隆已挂载的基础 Plugin 和 World config，然后沿活动消息路径重放操作，得到当前 Overlay。切换分支或消息版本后，重放另一条路径，自然得到另一份状态。

基础 Plugin 是共享事实，消息路径上的操作是会话事实，重放得到的 Overlay 是当前派生状态。它不需要复制整个 Plugin，也不需要为每个分支维护一份独立文件树。

### 阶段 10：统一环境与 CodeAct

模型不直接获得几十个 AI SDK tool。PulsarAI 只暴露一个模型工具 `codeAct`，其输入是一段包含显式 `return` 的 JavaScript 函数：

```js
async function () {
  const files = ls("@/");
  return files.map(({ id, path }) => ({ id, path }));
}
```

函数在与宏和 Plugin JavaScript 相同的环境对象中执行。文件 API、草稿 API、自定义工具、Agent 能力和后续 Feature 能力都只是环境函数，不再为模型建立第二套工具协议。

每次 CodeAct 调用对应一个 Overlay 事务：开始前保存快照，`{ ok: true }` 时提交，验证失败、抛错或 `{ ok: false }` 时整体回滚。最终消息保存成功、回滚和资源操作统计，但只把 thinking 与工具调用结果写入可见步骤。

## 三个事实来源

PulsarAI 刻意区分三类状态：

| 状态 | 事实来源 | 用途 |
| --- | --- | --- |
| 长期共享资源 | 数据库中的基础 Plugin | 角色资料、模板、脚本、全局能力 |
| 会话因果变化 | 活动消息版本的 Overlay 操作 | Agent 在某条分支上形成的记忆与文件变化 |
| 当前运行视图 | 基础 Plugin + 活动路径重放 | 生成、资源面板和编辑器实际读取的内容 |

用户在会话资源编辑器中的修改也不会偷偷改基础 Plugin。系统创建一条隐藏、空内容的系统消息，把操作挂到这条因果节点上；下一次发送时它已属于活动路径。

## 同步与异步边界

所有已启用 Plugin、当前 Conversation 和相关消息路径在生成前都已进入内存，因此路径解析、`read`、`ls`、`exists`、插槽查询和 Overlay 修改没有理由异步。

异步只出现在真正需要等待的边界：

- JavaScript 资源执行和允许异步表达式的宏解析；
- 模型请求与 Agent 流式输出；
- 数据库持久化、原生 Host 调用和网络访问；
- `input.send` 等明确产生持久化实体的操作。

普通文件修改先乐观更新当前内存或 Overlay，再在后台持久化。这样 Promise 不会污染最常用的同步路径逻辑。

## 角色包、Plugin 与 Conversation

角色包是用户角色的归属边界。它保存展示信息、一个本地资源 Plugin ID、主要生成 Plugin ID，以及启用的全局 Plugin ID。一个角色包可以有多个 Conversation。

Plugin 是资源和执行语义的载体。角色本地 Plugin 保存专属资料；全局 Plugin 提供可复用能力；内置 core Plugin 提供默认生成流程，blank Plugin 提供最小子 Agent，default Plugin 只是新 Plugin 模板。

Conversation 只拥有会话记录、消息树、版本、草稿和 Overlay 操作。它通过稳定 ID 引用角色包和 Plugin，不复制它们的可变名称或路径。

## 平台边界

Renderer Feature 只从 `@/host` 导入统一 Host facade：

- `host/desktop-electron` 拥有桌面窗口、拖拽、托盘、多窗口、环境检查和 Playwright。
- `host/mobile-tauri` 拥有 Android 电池控制、导航栏和系统语音识别。
- 共享数据库、配置、Secret、通知、网络代理和对话框位于 Host 的跨平台契约中。

平台专属能力只出现在 `host.desktop` 或 `host.mobile`，不会用无效的 no-op API 假装跨平台。

## 一次生成的完整路径

1. 用户草稿由 `input`/Composer 保存，但尚未进入历史。
2. 发送后持久化用户消息容器，并创建空助手消息版本。
3. Conversation 根据活动路径和角色包计算启用 Plugin。
4. 系统从基础 Plugin 与活动消息版本重放 Overlay。
5. 主 Plugin 的 `generatePath` JavaScript 进入统一 Sandbox 环境。
6. 生成脚本通过插槽取得路径，使用 `imports` 包装资源，再调用递归消息解析器。
7. 脚本创建 `agent.ToolLoopAgent({ container: reply })` 或显式调用 `agent.streamText`。
8. 模型只通过 CodeAct 访问环境 API；每次调用独立提交或回滚 Overlay 操作。
9. `reply` 流式持久化正文、thinking、工具步骤和模型信息。
10. 生成结束后写入耗时、日志数量和最终操作统计。

这条路径只有一套上下文构建、一套环境对象、一套文件 API 和一套操作事务。PulsarAI 的扩展性来自组合这些基础件，而不是并行增加运行时。
