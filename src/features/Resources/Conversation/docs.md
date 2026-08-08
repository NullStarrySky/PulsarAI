# Conversation

完整架构见 [`../Plugin/# PulsarAI 会话系统架构`](../Plugin/#%20PulsarAI%20会话系统架构)。

Conversation 初始化只并行读取并一次性提交角色包、分类、会话和消息容器状态；没有角色包时保持空状态，不自动创建默认角色包、不补建插件，也不选择第一项。角色包及其本地插件只由明确的新建操作产生。

当前主界面由 `ConversationStageOnePage` 编排，但数据与行为仍归 Conversation Store。`ConversationStageHeader` 负责角色包/会话选择、新建、置顶和删除；新写的 `ConversationStageThread` 与 `ConversationStageComposer` 保留 `724px` 中间列、全画布滚动和浮动输入栏，并复用细粒度的消息渲染、附件、Action、工具栏、分支图与生成组件，不挂载旧的 `ConversationWorkspacePage`。旧页面只作为功能清单参考。角色包或会话为空时只显示显式创建入口，不生成演示数据。

生成只固定外层生命周期：创建空助手容器与消息版本、重放 `.data.json` 更新、构建授权环境、运行主要插件 `runtime/generatePath`，最后绑定结果。Conversation 不编译固定上下文，不自动读取深度容器，也不自动执行 Regex。

流程获得：

- `activePath` 与未压缩 `chat`；
- 本轮 `emptyContainer`、`emptyMessage` 和重生成时的 `beforeGenerationMessage`；
- 绑定空助手目标的 `reply.read/setContent/appendContent/addPart/addStep/setModelName/fail` 闭包；
- `memory.prepare({ compressionThreshold })`，由流程决定是否调用；
- 已重放的 `variables`、只读 `data`、`imports`、Conversation/Plugin/Feature API 与 `agent.prepare()`；
- `compileChat(resource, environment?)`，用于编译任意 `.chat.json`，而不是固定主上下文。

`reply` 的写入立即刷新并持久化当前消息版本。`generatePath` 的返回值不会成为消息正文；流程通过 `reply` 写入结果，也可以合法结束并保留空消息。流式模型调用应逐段调用 `appendContent`，流结束后可用 `read()` 取得完整正文，处理后再用 `setContent` 覆盖。`setModelName` 写入实际模型标识；`fail` 把该版本设为可见的 `error` 消息。所有错误正文统一以 `[ERROR]` 开头，且不进入后续生成路径。

用户发送入口要求正文 `trim()` 后非空；只有换行或空白字符时不创建用户消息，即使已经选择附件或 Action。过程步骤使用透明容器，CodeAct 输出会展开嵌套 JSON、按 JSON token 高亮并自动换行。错误消息使用单层半透明 destructive 背景，不叠加 Bubble 子层背景或 Markdown 默认内边距。

重生成会先创建新的响应式消息版本。交给插件流程的 `emptyContainer`、`emptyMessage` 以及 `reply.read()` 结果必须是可序列化快照，不能把 Vue Proxy 直接传给 `structuredClone` 或 Sandbox。

压缩记忆是活动消息版本的派生不可变索引。验证或压缩失败时完整回退原始 `chat` 并返回诊断，不修改消息正文、版本或分支。

变量更新只保存可重放更新函数与哈希，按活动消息版本路径重放；不为每条消息持久化完整状态快照。`.data.json` 文件本身不会被运行状态改写。

插件测试使用数据库 `kind: "test"` 会话；临时测试会话只存在于当前 Agent 运行期，复用正常生成路径但不进入列表、搜索、备份或同步。
