# Conversation

Conversation 只负责持久化的会话、消息树、消息版本、生成请求和对应界面。它不拥有角色包、Plugin 资源或模型连接；调用方始终通过 `useConversation(chatId)` 绑定一个明确的 chat，Package 与 Plugin 只以稳定 ID 建立关系。

## 工作方式

1. `initializeConversation()` 恢复 Package、Chat、Message 与 Plugin，并在数据库为空时创建默认角色包和会话。
2. `useConversation(chatId)` 维护该 chat 的草稿、活动路径、分支、版本切换、发送和消息动作（复制、朗读、收藏、翻译、导出），不使用全局 active chat 作为领域状态。默认气泡只消费 `useMessageBubble` 的展示状态；`messageAction` 插槽从 Stage 透传至气泡，内置不保留“继续”动作。
3. 发送先持久化用户容器，再创建空的助手容器，最后调用 `generateRequestedAssistantReply()`。生成失败会写成 `ChatMessage.type: "error"`，因此仍是可见、可重试的消息版本。
4. 生成器以活动消息版本路径物化完整 World，从 `generatePath` 单选容器取得生成入口并在 Sandbox 环境中运行。`reply` 是本次生成唯一可写的助手消息目标。
5. 生成中的文件与 World config 变更由 Plugin runtime 绑定到“消息容器 + 具体消息版本”；版本仅保存自身结构化变更。World 从基础挂载、根配置和活动路径变更增量重算。
6. 当前消息的 `pluginChanges.stats` 保留资源操作与 Plugin/Sandbox 日志统计；消息底栏可以展开查看统计。切换分支或助手版本时，从最近公共缓存继续应用对应版本的变更。
7. 统一资源面板和文件编辑器读取当前 chat 的完整 World。手动编辑、移动、修改根 `config.json` 或选择容器会新增隐藏系统容器并写入操作；它不进入模型消息，但成为后续生成的因果节点。
8. Sandbox 环境暴露当前会话的 `conversationId`、`conversation`、`packageId`、`package`、`activePath`、`chat`/`CHAT` 与 `input`。`input.read/write/edit` 只操作持久化草稿，`input.send` 才把草稿追加为用户消息。

## 文件树

```text
Conversation/
├─ actions.ts                         会话命令注册与路由
├─ conversation-runtime.ts            包/分类恢复与首个包初始化
├─ use-conversation.ts                chatId 绑定的 UI 与运行时门面
├─ chats/
│  ├─ chat-store.ts                   Chat 记录、生成状态、草稿持久化
│  └─ ChatManager.vue                 Chat 管理界面
├─ composer/
│  ├─ ChatComposer.vue                组合输入、附件和模型选择
│  ├─ PromptBar.vue                   紧凑输入框、快捷工具与发送
│  ├─ ConversationComposerEditor.vue  Milkdown/Crepe 编辑器外壳
│  ├─ ComposerAttachmentStrip.vue     附件预览与移除
│  └─ composer-api.ts                 Sandbox 的 chat-bound draft/input API
├─ header/
│  └─ ConversationHeader.vue          包、会话、窗口控制组合
├─ messages/
│  ├─ conversation-types.ts           会话树、消息版本、Overlay 操作与统计契约
│  ├─ message-store.ts                容器/版本数据库读写与活动路径计算
│  ├─ conversation-generation.ts      助手容器生成、Sandbox/Agent 装配与错误落盘
│  ├─ （会话 World 物化与编辑入口归 Plugin 的 useWorld({ conversationId })）
│  ├─ ChatThread.vue                  活动路径消息列表
│  ├─ ChatBubble.vue                  消息、版本、步骤和 Overlay 统计展示
│  ├─ ChatSteps.vue                   thinking 与 codeAct 调用结果展示
│  └─ message-attachment.ts           附件 URL、打开与格式化
├─ stage/
│  ├─ ConversationStageOnePage.vue    会话主页面组合
│  ├─ markstream/                     消息 Markdown 与临时组件渲染
│  └─ milkdown/                       编辑器实例及 Plugin 宏高亮
├─ store/
│  └─ conversation-store.ts           轻量会话视图状态
└─ test/
   ├─ conversation-resource-overlay.test.ts  Plugin 会话树回放与 CodeAct 回滚测试
   └─ message-store.test.ts            活动路径、版本和消息树测试
```

## 不变量

- 基础 Plugin 资源是事实源；生成期改动只作为具体消息版本的有序 Overlay 操作持久化。
- 只重放每个容器的活动消息版本，不能把旁支或旧重生成版本的操作混入当前视图。
- `codeAct` 是操作原子边界：`ok: true` 才提交，返回错误或抛异常都回滚整次调用。
- Overlay 文件操作同步更新内存视图；消息与 Plugin 的数据库持久化在边界处异步进行，不能把 Promise 传播进同步文件 API。
- `ChatMessage.type === "error"` 是用户可见的失败状态；错误不得通过仅前端的临时状态隐藏。
- 生成步骤只保存 thinking 与工具调用/结果；宏展开与内部生命周期记录保留在 `PluginLogger`，其数量进入最终统计但不作为步骤写入消息。
