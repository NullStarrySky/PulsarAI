# Plugin

Plugin 是 Pulsar 的可编程资源系统。一个 Plugin 同时提供数据库支持的文件、插槽声明、生成入口、上下文文档、配置、数据、命令、组件和 Agent 能调用的文件 API。Conversation 只引用 Plugin，并在消息路径上叠加版本化修改；不会复制或直接改写基础 Plugin。

## 数据模型

- `Plugin.files` 是唯一持久化的文件集合。每个文件拥有稳定 ID、Plugin 相对路径、内容、排序值和可选插入声明。
- `Plugin.emptyFolders` 只保存没有文件或子文件夹的叶子空目录。非空目录及全部中间目录都由 `files` 和 `emptyFolders` 的路径推断。
- 角色本地 Plugin 的 `packageId` 指向所属角色包；全局及内置 Plugin 的 `packageId` 为 `null`。角色包分别记录本地资源 Plugin、主要生成 Plugin 和启用的全局 Plugin。
- 资源路径使用 `@pluginId/path`。资源源码内的 `@/path` 在 `read` 或 `import` 时会按该资源的所属 Plugin 改写为显式路径，因此来自不同 Plugin 的文档不会错误共享调用者作用域。

## 导入与递归解析

`import` 只定位一个资源、检查它的同步插入条件，并按资源类型包装或执行该资源。Markdown/text 返回文本，chat/data/json 返回对应包装结果，JavaScript 在 Sandbox 环境中执行，媒体和组件返回其专用表示。

`import` 不递归展开宏。`parse(pathOrPaths)` 导入选中资源后交给 Sandbox 统一递归解析：文本返回字符串，`.chat.json` 返回去除 `name`/`enabled` 作者元数据且已过滤停用项的纯 `message[]`。它统一负责 `{{ JavaScript }}`、`[[ JavaScript ]]` 的多轮解析、循环检测、轮次限制与日志；`read`、`import` 和 `slot.paths` 保持简单。

## 文件与界面 API

- `read`、`readMeta`、`ls`、`exists`、`slot.list/get/paths` 读取当前内存视图。
- `write`、`edit`、`mkdir`、`move`、`remove` 乐观地同步修改当前视图；普通编辑在后台持久化，生成期编辑写入 Conversation Overlay。
- `open`、`close`、`toggle` 操作资源编辑器；目标为 `@/` 或 `@pluginId/` 时操作相应 Plugin 面板。
- `read_docs()` 列出内置 Agent 文档 ID，`read_docs(id)` 同步返回对应 Markdown 文件的原始文本；这些文档按需读取，不常驻注入每次会话上下文。
- `slot.paths(id, scope?)` 返回显式的 `@pluginId/path` 数组。生成脚本把聊天路径直接交给 `parse()`。
- 除 JavaScript 资源执行、Sandbox 递归解析和数据库边界外，路径查询与文件操作保持同步。

## 插槽与约定资源

`slots.json` 声明插槽的 ID、作用域、后缀、选择模式和覆盖策略；文件通过自己的 `insertion.slot` 注册，另可声明同步 JavaScript `condition` 或 `conditionPath`。`order` 决定插槽顺序，相同值以 Plugin ID 和资源 ID 稳定排序。

固定约定包括 `config.json`、`slots.json`、`generatePath`、`chat`、`REGEX`、`DATA`、`COMMAND`、`background`、`tools/<name>/tool.js` 与 `tools/<name>/prompt.md`。背景候选与选择只属于 `background` 插槽，不复制到 `config.json`。

## 文件树

```text
Plugin/
├─ docs.md                         功能边界与实现说明
├─ PluginHeaderButton.vue          打开当前 Plugin 资源面板
├─ PluginManagerPanel.vue          Plugin 管理界面
├─ tree/
│  ├─ plugin-types.ts              扁平文件、推断目录、路径与资源类型
│  ├─ plugin-store.ts              Plugin 状态、乐观修改、编辑器与面板状态
│  ├─ plugin-persistence.ts        数据库读写与搜索
│  ├─ builtin-plugins.ts           内置文件打包与装载
│  ├─ slot-store.ts                插槽声明、资源收集和稳定排序
│  ├─ PluginAssetTreePanel.vue     角色本地/全局/内置资源树
│  ├─ PluginFileEditorDialog.vue   文件编辑对话框
│  └─ PluginInsertionConditionEditor.vue 插入条件编辑
├─ runtime/
│  ├─ environment.ts               Conversation 绑定的 Sandbox 环境装配
│  ├─ self-api.ts                  文件、插槽及 open/close/toggle API
├─ resources/
│  ├─ resource-types.ts            文本/二进制内容边界
│  ├─ resource-wrapper.ts          各资源类型的单资源 import 包装
│  └─ PluginResourceRenderer.vue   通用资源渲染入口
├─ editors/                        chat、config、data、JS、media、regex、slot、Vue 编辑器
├─ environment/                    PluginLogger 与受控工具函数
├─ agent/                          ToolLoopAgent、codeAct 与 askUser
├─ builtIn/                        core、blank、default 三套内置 Plugin 来源
└─ test/                           文件模型、import/作用域与工具回归测试
```

## 不变量

- 基础文件持久化与 Conversation Overlay 是两个事实层；生成期不得直接污染基础 Plugin。
- 一个 `codeAct` 是一个事务：函数成功且显式返回才提交该次操作，否则恢复调用前快照。
- `@/` 的含义由源码所属 Plugin 决定，不由最外层生成 Plugin 或当前循环决定。
- `import` 负责单资源包装，`parse` 负责对选中资源递归解析；不得把递归行为塞回 `import`。
- `regex.json` 是启用 Plugin 根目录的规则定义，自动注册到有序 `REGEX` 插槽；生成路径决定是否执行它，`applyOnRendering: true` 仅允许影响展示。
- Renderer 只能拿到受限环境能力，不能取得 Pinia Store、Node、Electron/Tauri 或任意命令执行能力。
