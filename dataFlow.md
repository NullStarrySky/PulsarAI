# Database / Conversation / Plugin 数据流

本文描述 `src/features/Database`、`src/features/Conversation`、`src/features/Plugin` 的当前文件结构、职责边界和端到端数据流。它记录的是当前实现，不是兼容层或未来架构提案。

## 总体设计

三个 Feature 的关系是：

```text
Host database
    ↕ Database/database-service.ts
Database/dbsync-store.ts（唯一会话内存源、脏标记、批量持久化）
    ↕                         ↕
Conversation/dataflow        Plugin/dataflow
会话元数据、消息树、活动路径      World 源文档、Pulse、回放视图、File/Slot API
    └──────────────┬──────────────┘
                   ↓
       Plugin/runtime/run-api.ts
       生成环境 + Agent 输出适配
                   ↓
       消息版本增量写回 dbsync
```

核心原则：

- Database 只负责记录 I/O、内存驻留、脏数据调度与同步元数据，不承载 Conversation 或 Plugin 的领域操作。
- Conversation 用 `chatId` 显式寻址。`ChatMeta` 保存会话级元数据和草稿，`ChatContainer` 组成可分支消息树，当前 `lastContainerId` 决定活动路径。
- Plugin 的持久化源是 `PluginData { tree, meta }`。一次资源修改由一个 `Pulse` 表示；会话中的 Pulse 归属于具体消息版本，回放时才叠加到源 World 上。
- 生成是两条数据流的汇合点：Conversation 提供活动消息路径，Plugin 提供按该路径回放后的 World、插槽和 Sandbox 环境；流式结果再写回当前 assistant 消息版本。
- Tabs 只拥有视图生命周期。`features/Tabs/store.ts` 打开 tab 时调用 dbsync `load(chat)`，关闭后延迟 `unload(chat)`；它不拥有或复制会话数据。

## `src/features/Database`

```text
Database/
├─ database-service.ts  — Host database 的类型化薄封装；查询、upsert、remove，并记录本地同步变更。
├─ dbsync-store.ts      — Pinia 内存源；按需 load/unload 会话，监听响应式实体，刷新 Character 投影，聚合 dirty 并延迟写库。
├─ mock-database.ts     — 内存数据库实现及 JSON Patch 支持，供非原生环境和测试使用。
└─ sync-metadata.ts     — 设备 ID、实体版本向量、删除标记及远端写入上下文，用于 LAN 同步冲突判断。
```

`dbsync-store.ts` 中的领域表映射由各 Feature 通过 `registerSyncHandler` 注册：Conversation 注册 `meta → conversations`、`container → message_containers`；Plugin 注册 `plugin → resource_worlds:local:<id>`。因此 Database 知道如何调度，但具体序列化规则仍归领域 Feature 所有。

## `src/features/Conversation`

```text
Conversation/
├─ clear-data.ts                              — 清空角色/会话数据并刷新应用的用户动作。
├─ components/
│  ├─ ChatBubble.vue                          — 单条消息气泡、版本操作和消息删除入口。
│  ├─ ChatComposer.vue                        — 绑定指定 chatId 的持久化草稿并触发发送。
│  ├─ ChatManager.vue                         — 当前角色的会话列表、创建、选择、置顶和删除。
│  ├─ ChatSteps.vue                           — 展示思考、工具调用与工具结果步骤。
│  └─ ChatThread.vue                          — 活动消息路径的虚拟列表、编辑和分支交互。
├─ dataflow/
│  ├─ index.ts                                — Conversation dataflow 的统一导出入口。
│  ├─ types.ts                                — ChatMeta、ChatContainer、ChatMessage、附件/引用/步骤等数据契约和构造函数。
│  ├─ chats.ts                                — 会话集合/单会话查询、创建删除、运行时生成状态和 app-lifetime 清理。
│  ├─ containers.ts                           — 消息容器查询，并注册 container 的数据库持久化映射。
│  ├─ activePathComposable/
│  │  ├─ index.ts                             — 从 lastContainerId 投影活动路径，管理发送/生成/重生成/删除，并把 Pulse 绑定到消息版本。
│  │  ├─ interval-services.ts                 — 从活动消息计算 open/close interval 及诊断投影。
│  │  └─ message-service.ts                   — 创建消息/容器、沿父链求路径，并转换为 AI SDK ModelMessage。
│  └─ containerComposable/
│     ├─ index.ts                             — 聚合单容器的 actions、attachments、branch、intervals、message、version 能力。
│     ├─ actions.ts                           — 消息动作的分发与执行入口。
│     ├─ attachments.ts                       — 文件附件选择、读取、添加与移除。
│     ├─ branch.ts                            — 子分支列表、活动分支选择与分支跳转。
│     ├─ intervals.ts                         — 给消息版本写入 interval 操作。
│     ├─ message.ts                           — 当前消息内容、收藏、编辑等单消息操作。
│     └─ version.ts                           — 同一容器内消息版本的创建、选择和删除。
└─ stage/
   ├─ ConversationSurface.vue                 — 组合指定 chatId 的 ChatThread 与 ChatComposer。
   └─ markstream/ConversationMarkdown.vue     — 使用 Markstream 渲染消息 Markdown。
```

### 会话写入与生成流

1. `ChatComposer` 通过 `useActivePathComposable(chatId).draft` 修改 `ChatMeta.composerDraft`；dbsync 将 meta 标脏并在稍后批量持久化。
2. `send()` 把草稿变成 user container，连接到当前尾节点；随后创建 assistant container，并更新 `rootContainerId`、`lastContainerId` 和父节点的分支指针。
3. `pathForTail()` 沿 `previousContainer` 得到活动路径；`modelMessagesFromPath()` 选取每个容器的活动消息版本、读取媒体链接并生成模型消息。
4. 同一路径上的 `message.meta.pulses` 被组成 replay groups；`usePluginData()` 将其按顺序应用到 Plugin 源文档的克隆上。
5. `runWorld()` 在这个精确的消息版本投影上建立 Plugin 环境并运行选中的 `generatePath`。
6. Agent 的文本、思考、工具结果和 token usage 直接赋值到 assistant `ChatMessage`，每次更新都把容器标脏。
7. 失败会转换为持久化的 `ChatMessage.type = "error"`，而生成中状态只存在内存，不进入数据库。

## `src/features/Plugin`

```text
Plugin/
├─ docs.md                                    — Plugin/World 作者文档。
├─ agent/
│  ├─ components/AskUserComponent.vue         — Plugin Agent 的结构化询问界面。
│  └─ runtime/
│     ├─ ask-user.ts                           — askUser 输入校验、请求注册和 Promise 生命周期。
│     ├─ code-act.ts                           — 校验并在授权 Sandbox 环境执行唯一模型工具 codeAct。
│     └─ default-agent.ts                      — 绑定当前 ChatMessage 的 AI SDK ToolLoopAgent/streamText，直接赋值流式结果。
├─ builtIn/
│  ├─ blank/
│  │  ├─ config.json                           — 空白生成 Plugin 的可编辑配置定义。
│  │  └─ generate.js                           — 不注入模板的最小生成入口。
│  ├─ core/
│  │  ├─ AGENTS.md                             — 内置 core 资源的局部维护说明。
│  │  ├─ config.json                           — core 生成配置定义。
│  │  ├─ generate.js                           — 默认生成流程入口。
│  │  ├─ prompt.md                             — core Agent 的基础提示资源。
│  │  ├─ regex.json                            — 内置渲染/文本正则规则。
│  │  ├─ action/goal.js                        — 目标类动作资源。
│  │  ├─ action/process.js                     — 过程类动作资源。
│  │  ├─ background/classroom.png              — 内置背景媒体资源。
│  │  ├─ context/before-regex.js               — 正则处理前的上下文资源。
│  │  ├─ context/build.js                      — 汇总插槽内容并构建模型上下文。
│  │  ├─ context/data.chat.json                — 结构化上下文消息示例/定义。
│  │  ├─ context/data.data.json                — 可注入数据定义。
│  │  ├─ default.chat.json                     — 默认角色消息上下文。
│  │  ├─ docs/conversation.md                  — Sandbox Conversation API 内置说明。
│  │  ├─ docs/package.md                       — Package API 内置说明。
│  │  ├─ docs/plugin.md                        — Plugin/World API 内置说明。
│  │  └─ goal/goal.data                        — 内置目标数据文件。
│  └─ default/
│     ├─ config.json                           — 默认 Plugin 配置 schema/初值。
│     ├─ ConfigController.vue                  — 默认配置的结构化编辑组件。
│     ├─ default.chat.json                     — 默认上下文消息资源。
│     └─ prompt.md                             — 默认提示资源。
├─ dataflow/
│  ├─ index.ts                                — Plugin dataflow 的统一导出入口。
│  ├─ types.ts                                — ResourceTree/Meta、PluginData、Character 投影、Pulse 和资源类型契约。
│  ├─ pulse.ts                                — 路径解析、树操作、Pulse 应用/回放和文件读取的纯逻辑。
│  ├─ use-file-api.ts                         — 在一个 PluginData 投影上提供同步 read/write/edit/ls/move/copy/remove。
│  ├─ use-file-tree-ui.ts                     — 资源树 tabs、菜单动作、剪贴板和图标等 UI 投影。
│  ├─ use-opened-file.ts                      — 当前打开文件、浮层位置和资源树定位请求状态。
│  ├─ use-plugin-data.ts                      — 读取源 Plugin，挂载 built-ins，并按 Conversation Pulse 回放。
│  ├─ use-slot.ts                             — 构建 slot 树、收集和排序贡献资源、执行单选/多选。
│  └─ use-tree-merge.ts                       — 把全局来源只读挂载到本地 World 的 `/global/<source>`。
├─ resources/
│  ├─ import.ts                               — 按资源类型、条件和宏规则导入一个资源。
│  ├─ resource-condition.ts                   — 条件表达式定义、环境构造和同步求值。
│  ├─ resource-types.ts                       — 编辑器侧 ResourceFile/PluginResource 内容类型工具。
│  ├─ resource-wrapper.ts                     — 把文本、JSON、chat、data、JS、media 等包装为运行时值。
│  ├─ token-estimate.ts                       — 可引用文本的 token 估算。
│  ├─ PluginAssetTreePanel.vue                — Assets/Slots/Sources 三种投影的资源树面板。
│  ├─ PluginFileEditorDialog.vue              — 浮动文件编辑器及资源元数据控制。
│  ├─ PluginResourceConditionEditor.vue       — 资源插入条件的结构化编辑器。
│  ├─ PluginResourceRenderer.vue              — 资源预览/源码编辑的分派容器。
│  ├─ PluginTypeRenderer.vue                  — 按扩展名选择类型专用编辑器。
│  └─ types/
│     ├─ chat/plugin-chat.ts                  — `.chat.json` 校验、默认值及 ModelMessage 转换。
│     ├─ chat/PluginChatEditor.vue            — role-aware chat 资源编辑器。
│     ├─ config/plugin-config.ts              — Plugin 配置字段类型定义。
│     ├─ config/PluginConfigEditor.vue        — Plugin 配置表单编辑器。
│     ├─ data/plugin-data.ts                  — `.data.json` 校验、隔离值和读写 facade。
│     ├─ data/PluginDataEditor.vue            — data 定义结构化编辑器。
│     ├─ javascript/JavaScriptCodeMirrorEditor.vue — 带 Plugin API 补全的 JavaScript 编辑器。
│     ├─ javascript/one-dark-pro-theme.ts     — JavaScript 编辑器的 One Dark Pro 主题。
│     ├─ media/plugin-media.ts                — 媒体内容解析、类型识别与序列化。
│     ├─ regex/plugin-regex.ts                — regex 规则 schema、解析和默认值。
│     ├─ regex/PluginRegexEditor.vue          — regex 规则结构化编辑器。
│     └─ vue/plugin-vue-runtime.ts            — 动态 Vue 资源的编译和模块加载。
├─ runtime/
│  ├─ environment.ts                          — 构造 source-scoped Sandbox、File/Slot API、imports 和自定义工具。
│  ├─ logger.ts                               — Plugin 执行日志记录器。
│  ├─ mode-slot.ts                            — 从 MODE slot 投影可选运行模式。
│  ├─ run-api.ts                              — 把当前 ChatMessage 作为 reply，连接 Conversation、Plugin 环境和 Agent。
│  └─ yaml-formatter.ts                       — YAML formatter 与 Skill Markdown 解析工具。
├─ shared/procedural-cover.ts                 — 根据稳定 seed 生成默认封面和头像 data URL。
└─ utils/import-converter.ts                  — 内置 slot 注册表、built-in 导入及本地 Plugin 初始 World 创建。
```

### World 编辑与回放流

```text
resource_worlds:local:<localPluginId>（源 PluginData）
        + 内置 global PluginData
        ↓ useTreeMerge
统一寻址树：/self 语义对应本地源，/global/<source> 对应共享源
        + 活动路径中每个消息版本的 Pulse[]
        ↓ replayPluginData（克隆后顺序应用）
当前消息版本可见的 World
        ↓ useFileApi / useSlot / createPluginEnvironment
编辑器、Sandbox、生成流程
```

源编辑直接修改 dbsync 中的本地 `PluginData` 并标记 `plugin` dirty；同一个深层 watcher 还会原位刷新 Character 的名称、描述、头像和封面。Conversation 运行时编辑则把 Pulse 追加到当前消息版本，不改写源文档。这样同一 Plugin 的不同会话和不同消息分支可以共享源，同时得到各自可复现的 World 投影。

## Tabs 视图生命周期

```text
Tabs/
├─ store.ts       — `{type:"chat", id}[]`、activeId、open/close/reorder/active 和顶栏 views computed。
├─ store.test.ts  — load、排序、激活与延迟 unload 的聚焦单元测试。
└─ TabBar.vue     — 受控 tab 栏；渲染图标/名称/关闭按钮，支持拖拽和 Alt+方向键排序。
```

`open({ type: "chat", contentid })` 先取消同 ID 的待卸载任务，再 `load({type:"chat", id})`，最后去重加入并激活。`close(id | index)` 立即移除视图并选中右侧或左侧相邻项，300ms 后确认没有重新打开才 `unload`。TabBar 不直接读写 store，只通过 props 与事件受控。

## 持久化边界摘要

| 数据 | 内存所有者 | 持久化位置 | 写入触发 |
|---|---|---|---|
| 本地 Plugin 源 World | `dbsync.plugins` | `resource_worlds:local:<id>` | 源编辑后标记 `plugin` dirty |
| 会话元数据与草稿 | `dbsync.chatMeta` | `conversations:<chatId>` | chat 操作或草稿变化后标记 `meta` dirty |
| 消息树与版本/Pulse | `dbsync.containers` | `message_containers:<containerId>` | 容器、消息、版本或 Pulse 变化后标记 `container` dirty |
| 生成进度 | `ChatMeta.generation` | 不持久化 | 生成开始/结束时仅更新运行时状态 |
| 打开的 tabs 与 activeId | `Tabs` store | 不持久化 | UI open/close/reorder/active |
| LAN 同步版本信息 | `sync-metadata.ts` | Host 提供的本地元数据存储 | database-service 成功写入或远端合并 |

dbsync 默认在首次 dirty 后 500ms 批量写入；卸载 chat 前会主动 flush，避免视图释放导致未写数据丢失。Tabs 的 300ms 延迟卸载用于吸收关闭后立刻重开的 UI 操作，两种延迟承担不同职责。
