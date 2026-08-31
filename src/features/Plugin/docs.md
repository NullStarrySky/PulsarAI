# Plugin

World 是 Pulsar 的可编程资源系统。Plugin 只保留为数据库、共享和导入导出的挂载单元；运行时、编辑器和 Agent 面对的是角色包的一棵完整 World 树。Conversation 在消息路径上叠加版本化修改，不直接改写基础挂载。

## 数据模型

- `Plugin.files` 是唯一持久化的文件集合。每个文件拥有稳定 ID、Plugin 相对路径、内容、排序值和可选插入声明。
- `Plugin.emptyFolders` 只保存没有文件或子文件夹的叶子空目录。非空目录及全部中间目录都由 `files` 和 `emptyFolders` 的路径推断。
- World 根固定为 `/config.json`、`/self/` 和 `/global/`：角色本地 Plugin 挂载到 `/self/`，全部全局及内置 Plugin 挂载到 `/global/<pluginId>/`。
- 角色包只保存一个 `worldConfig`，其中 `slots` 定义共享插槽，`disabled` 保存禁用文件或 Plugin 挂载路径。禁用贡献不进入插槽，但对应文件仍挂载且可直接读取。
- 资源源码内的 `@/path` 始终表示其来源 Plugin 根；跨挂载组合时会规范化为 World 的 `/self/path` 或 `/global/<pluginId>/path`，不会串用调用者作用域。

## 导入与递归解析

`import` 只定位一个资源、检查它的同步插入条件，并按资源类型包装或执行该资源。Markdown/text 返回文本，chat/data/json 返回对应包装结果，JavaScript 在 Sandbox 环境中执行，媒体和组件返回其专用表示。

`import` 不递归展开宏。`parse(pathOrPaths)` 导入选中资源后交给 Sandbox 统一递归解析：文本返回字符串，`.chat.json` 返回去除 `name`/`enabled` 作者元数据且已过滤停用项的纯 `message[]`。它统一负责 `{{ JavaScript }}`、`[[ JavaScript ]]` 的多轮解析、循环检测、轮次限制与日志；`read`、`import` 和 `slot.paths` 保持简单。

## 文件与界面 API

- `useWorld({ packageId })` 直接修改基础 World；`useWorld({ conversationId })` 读取活动路径并把修改绑定到隐藏消息。`world.bind(container, message)` 精确绑定已有消息版本。
- `read`、`readMeta`、`ls`、`exists` 与 `useWorldContainer(world, id)` 读取当前内存视图。
- `write`、`edit`、`mkdir`、`move`、`remove`、`configure`、`select` 修改当前 World；会话修改持久化为消息版本的有序操作。
- `open`、`close`、`toggle` 操作统一资产面板或资源编辑器。
- `read_docs()` 列出内置 Agent 文档 ID，`read_docs(id)` 同步返回对应 Markdown 文件的原始文本；这些文档按需读取，不常驻注入每次会话上下文。
- `slot.paths(id, scope?)` 返回选中且有效的完整 World 路径。生成脚本通过选中的 `CTX_BUILD` 资源构建聊天上下文。
- 除 JavaScript 资源执行、Sandbox 递归解析和数据库边界外，路径查询与文件操作保持同步。

## 插槽与约定资源

根 `/config.json` 是全局插槽契约的唯一来源，并与 Plugin `slots.json` 使用同一种插槽定义。Plugin 插槽只在来源内可见，没有父级或子插槽语义；文件通过自己的 `insertion.slot` 直接注册到本地或全局插槽，另可声明同步 JavaScript `condition` 或 `conditionPath`。`order` 决定插槽顺序，相同值以 Plugin ID 和资源 ID 稳定排序。

固定约定包括 World `/config.json`、各 Plugin 自己的 `config.json`/`slots.json`、`generatePath`、`chat`、`REGEX`、`DATA_INJECT`、`data_prompt`、`COMMAND`、`background`、`tools/<name>/tool.js` 与 `tools/<name>/prompt.md`。`.data.json` 只保存状态定义；`DATA_INJECT` 只由生成流程读取，`.chat.json` 数据说明放入只由上下文构建读取的 `data_prompt`。背景选择属于 World config 中的 `background` 全局插槽，不复制到插件配置。

`ctxbuilder(ctx, features)` 是唯一环境装配入口：`ctx` 必须先给出 `conversationId` 与来源 `pluginId`。`message` 返回并写入具体消息容器/版本；`plugin` 仅在消息版本存在时绑定 World API。`runWorld` 从 `generatePath` 单选容器取得入口，Conversation 不自行选择 Plugin 或拼装环境。

## 文件树

```text
Plugin/
├─ docs.md                         功能边界与实现说明
├─ tree/
│  ├─ plugin-types.ts              扁平文件、推断目录、路径与资源类型
│  ├─ plugin-store.ts              Plugin 状态、乐观修改、编辑器与面板状态
│  ├─ plugin-persistence.ts        数据库读写与搜索
│  ├─ builtin-plugins.ts           内置文件打包与装载
│  ├─ slot-store.ts                插槽声明、资源收集和稳定排序
│  ├─ world-config.ts              共享插槽、禁用路径与选择校验
│  ├─ world-path.ts                /self 与 /global 挂载路径
│  ├─ world-store.ts               组合式 World/消息绑定/容器 API
│  ├─ PluginAssetTreePanel.vue     完整 World 资源树与根配置入口
│  ├─ PluginFileEditorDialog.vue   文件编辑对话框
│  └─ PluginInsertionConditionEditor.vue 插入条件编辑
├─ runtime/
│  ├─ ctx-builder.ts               声明式上下文 feature 装配
│  ├─ run-api.ts                   消息绑定的 Plugin generatePath 执行入口
│  ├─ environment.ts               条件、配置与可抛弃预览支持
│  ├─ self-api.ts                  文件、插槽及 open/close/toggle API
│  ├─ logger.ts                    PluginLogger
│  ├─ yaml-formatter.ts            YAML 格式提取
│  └─ index.ts                     runtime 公共导出与受控工具
├─ resources/
│  ├─ resource-types.ts            文本/二进制内容边界
│  ├─ resource-wrapper.ts          各资源类型的单资源 import 包装
│  └─ PluginResourceRenderer.vue   通用资源渲染入口
├─ editors/                        chat、config、data、JS、media、regex、slot、Vue 编辑器
├─ agent/                          ToolLoopAgent、codeAct 与 askUser
├─ builtIn/                        core、blank、default 三套内置 Plugin 来源
└─ test/                           文件模型、import/作用域与工具回归测试
```

## 不变量

- 基础挂载与消息版本的结构化 World 变更是两个事实层；会话 World 从完整基础树增量应用活动路径变更，生成期不得直接污染基础 Plugin。
- `codeAct` 的资源写入直接进入当前消息版本；不通过撤销快照，最终树由版本变更重算。
- 对外 World 根为 `/config.json`、`/self/` 与 `/global/`；源码中的 `@/` 只按来源 Plugin 根解析后再规范化。
- `import` 负责单资源包装，`parse` 负责对选中资源递归解析；不得把递归行为塞回 `import`。
- 一个插槽只属于生成流程构建或上下文构建，不能同时用于两者；`DATA_INJECT` 和 `data_prompt` 是数据资源的阶段边界。
- 未被 World config 禁用的 Plugin 根 `regex.json` 注册到有序 `REGEX` 容器；禁用只取消插槽贡献，不阻止直接读取文件。
- Renderer 只能拿到受限环境能力，不能取得 Pinia Store、Node、Electron/Tauri 或任意命令执行能力。
