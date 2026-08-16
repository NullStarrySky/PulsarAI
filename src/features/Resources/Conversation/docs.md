# Conversation

The focused conversation stage always has an active database-backed character package and conversation. Initialization creates and selects the missing resource, and opening or deleting the last conversation creates a fresh blank conversation instead of routing through a separate empty page. One conversation per package may be marked as its template; new conversations clone its active path and renderer, and management lists show the template badge.

Plugin commands come from the global `COMMAND` container. A `.js` command runs as a temporary generation process against the current conversation path; text after `/command` is exposed as `prompt` but is not written as a user message. A `.md` command fills the composer, and a `.vue` command opens its restricted component view. The generation `chat` array exposes `chat.push({ role, content, meta? }, merge?)` for persisted conversation messages; `merge: true` appends to the active tail when the role matches, otherwise it creates and activates a new branch node. `time.now()` returns ISO time, epoch milliseconds, and the local timezone offset.

JavaScript commands create hidden command containers instead of ordinary assistant containers. They remain on the active causal path for branching, audits, and resource-overlay replay, but are omitted from ordinary `chat` and compression input. A command container records its command name and arguments and exposes a command-local virtual `draft.md`: `ctx.draft.read()` / `ctx.draft.edit(find, replace)` and the normal `read("draft.md")` / `edit("draft.md", find, replace)` refer to the same persisted Markdown field. The conversation thread renders these as collapsed command panels.

`conversation.requestContainer(...)` is the only request entry. `generate` creates and runs a new ordinary assistant container; `command` creates and runs a new hidden command container; `regenerate` adds and activates a new version of an existing ordinary assistant container; `continue` and `rewrite` run against its active version in place, without switching versions. Command containers are immutable with respect to versions: they cannot switch/add/delete versions or receive regenerate, continue, or rewrite requests.

The Sandbox exposes `await generate({ plugin?, environment?, prompt })` for sub-agents. `plugin` defaults to `builtin-blank-plugin`; `environment` selects an existing conversation as read-only history, while an omitted value creates an in-memory ephemeral conversation. The call returns only the child agent's final Markdown, keeps its messages out of the selected conversation, and limits nesting to three levels. Parent replies record running/completed/failed sub-agent steps.

Messages may include a standalone `<Filename.vue />` reference. Milkdown transforms that exact filename into a block node and resolves only `temp/Filename.vue` under the Plugin recorded in the message's generation metadata. The dynamic component runtime accepts `<template>` content but intentionally does not execute `<script>`.

Streaming assistant changes update the in-memory message immediately and throttle intermediate container persistence to one write per 250ms. Generation completion waits for any queued write and persists the final container state without throttling.

Current chat messages compose the shadcn-vue Attachment, Bubble, Marker, Message, and Message Scroller primitives. Concrete message versions retain `createdAt`; the footer shows time, sibling-version navigation, message actions, and the visible-path floor number. The latest assistant footer remains visible. A blank conversation shows prompt suggestions above the composer and only fills the draft when selected.

Milkdown/Crepe generated `<br>` tags are normalized to Markdown newlines at editor output, message display, persistence, and model-context boundaries; model-visible text never retains editor-generated HTML line breaks.

完整架构见 [`../Plugin/# PulsarAI 会话系统架构`](../Plugin/#%20PulsarAI%20会话系统架构)。

Conversation 初始化只并行读取并一次性提交角色包、分类、会话和消息容器状态；没有角色包时保持空状态，不自动创建默认角色包、不补建插件，也不选择第一项。角色包及其本地插件只由明确的新建操作产生。

当前主界面由 `ConversationStageOnePage` 编排，但数据与行为仍归 Conversation Store。`ConversationStageHeader` 负责角色包/会话选择、新建、置顶和删除；`ConversationStageThread` 与 `ConversationStageComposer` 保留 `724px` 中间列、全画布滚动和浮动输入栏，并复用细粒度的消息渲染、附件、Action、工具栏、分支图与生成组件。角色包或会话为空时只显示显式创建入口，不生成演示数据。

生成只固定外层生命周期：创建空助手容器与消息版本、沿活动路径重放资源 Overlay、构建授权环境、运行主要插件 `runtime/generatePath`，最后绑定结果。Conversation 不编译固定上下文，不自动读取深度容器，也不自动执行 Regex。

Composer 的模型入口位于右侧并保存组合引用 `provider/modelId/thinkingLevel`；思考强度在模型菜单内调整。工具目录不再包含独立强度按钮或主要插件选择器，主要插件仍由 Plugin 资产管理入口设置。

流程获得：

- `activePath` 与未压缩 `chat`；
- 本轮 `emptyContainer`、`emptyMessage` 和重生成时的 `beforeGenerationMessage`；
- 绑定空助手目标的 `reply.read/setContent/appendContent/addPart/addStep/setModelName/fail` 闭包；
- `memory.prepare({ compressionThreshold })`，由流程决定是否调用；
- 已重放的 `variables`、`data`、`imports`、Conversation/Plugin/Feature API 与 Conversation 绑定的 `new agent.ToolLoopAgent({ container: reply }).stream({ messages })`；
- `compileChat(resource, environment?)`，用于编译任意 `.chat.json`，而不是固定主上下文。

`reply` 的写入立即刷新并持久化当前消息版本。`generatePath` 的返回值不会成为消息正文；流程通过 `reply` 写入结果，也可以合法结束并保留空消息。流式模型调用应逐段调用 `appendContent`，流结束后可用 `read()` 取得完整正文，处理后再用 `setContent` 覆盖。`setModelName` 写入实际模型标识；`fail` 把该版本设为可见的 `error` 消息。所有错误正文统一以 `[ERROR]` 开头、使用 Markdown 渲染（包括 Sandbox 的 `js` 代码块），且不进入后续生成路径。

用户发送入口要求正文 `trim()` 后非空；只有换行或空白字符时不创建用户消息，即使已经选择附件或 Action。过程步骤使用透明容器，CodeAct 输出会展开嵌套 JSON、按 JSON token 高亮并自动换行。错误消息使用单层半透明 destructive 背景，不叠加 Bubble 子层背景或 Markdown 默认内边距。

重生成会先创建新的响应式消息版本。交给插件流程的 `emptyContainer`、`emptyMessage` 以及 `reply.read()` 结果必须是可序列化快照，不能把 Vue Proxy 直接传给 `structuredClone` 或 Sandbox。

消息区域标注直接写入 Markdown：`<pulsar-rewrite instruction="长一点">原文</pulsar-rewrite>`。渲染器高亮该区域；重写把带标注的原正文作为普通生成消息提供给模型、清空当前版本后写回干净 Markdown。继续则复用当前版本且不清空正文或步骤，只把新增流式输出与步骤追加到原版本。

压缩记忆是活动消息版本的派生不可变索引。验证或压缩失败时完整回退原始 `chat` 并返回诊断，不修改消息正文、版本或分支。

会话资源 Overlay 把文件节点的 edit/create/move/remove 与 `.data` 实例的纯 JSON edit 保存成同一组有序操作，并按活动消息版本路径重放。运行态不直接改写基础插件树或 `.data.json` 定义；切换分支即得到该路径对应的文件与 Data 视图。

插件测试使用数据库 `kind: "test"` 会话；临时测试会话只存在于当前 Agent 运行期，复用正常生成路径但不进入列表、搜索、备份或同步。

`Conversation.binding` 只保存 `resourceType`、稳定 `resourceId` 和必要时的 `pluginId`。标题、插件节点路径与所属角色包在读取时解析；插件文件移动或重命名不要求同步改写会话。消息树只持久化 `previousContainer` 与 `activeNextContainer`，可用分支通过父 ID 查询得到，不再双向维护子 ID 数组。

一条消息的可重放资源更新统一保存为 `meta.resourceUpdate.operations`。一次 CodeAct 内的文件和 Data 操作原子提交，失败时一起回滚；生成期间不触发单独文件自动保存。

SillyTavern JSONL 会话由 `src/features/Migrations/SillyTavern` 在提交阶段写入本 Feature。每条原消息对应一个 `ChatMessageContainer`，`mes` 与 `swipes` 对应其中的具体消息版本，`swipe_id` 选择活动版本；原有会话先导入，角色卡首条消息与备用开场白另建模板会话。导入关系只通过角色卡名称/文件 nickname 的唯一匹配建立，缺失或歧义会阻止提交，不由 Conversation Store 猜测归属。
