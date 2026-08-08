# Plugin

`插件系统.md` 是插件架构的唯一事实来源。本文件只记录源码落点。

## 数据与文件

- `resource_plugins` 保存插件元信息，`resource_plugin_nodes` 保存稳定文件节点；路径不是身份。
- 文件节点使用 `treeOrder` 排列文件树，使用 `order` 排列容器内容。
- 每个文件最多有一个 `insertion: { target: string; condition?: string }`。条件列表保存为一个同步 JavaScript 布尔表达式，执行时可使用当前资源的 `imports` 以及 `include`、`exclude`、`probability`。
- `containers.json` 声明 `{ id, title, scope, description, contentSuffixes }`。容器只是注册表，不自动参与生成。
- `contentSuffixes` 支持复合后缀、`*` 和 `media`；空数组不接受资源。
- 容器成员的完整路径是 `<pluginId>/<插件内路径>`；插件 ID 是可编辑的顶层路径段，同名文件不会跨插件冲突。

## 运行

- `manifest.json` 的 `runtime/generatePath` 指向唯一生成入口。缺少入口的插件不能设为主要插件；路径存在但不是有效 `.js` 文件时直接报错。
- `generation/model` 与 `generation/reasoningEffort` 是固定配置键；留空时继承全局默认值，不写入 Conversation。
- `appearance/background` 保存 `{ pluginId, path }`；留空或引用无效时回退到内置核心插件的同名固定配置。
- manifest 的 `ModelSelect` 配置组件保存 `providerId/modelId`，支持用 `props.apiType` 限制模型类型；会话工具栏可直接选择具有有效生成入口的主要插件。
- Conversation 创建空助手消息后，把原始消息、回复闭包、压缩记忆闭包、`imports`、Agent 与 Feature API 交给该入口。入口返回值不会写入消息；正文、内容部件、过程和模型标识必须通过 `reply` 写入。内置 Agent 使用 AI SDK 7 的 `runner.stream()` 与 `result.stream`，过程回调实时写入步骤，所有 step 的 `text-delta.text` 按到达顺序逐段追加正文；每段 reasoning 在结束后作为一个 `thinking` step 写入，避免按 token 创建大量步骤。流结束后仍可读取并覆盖完整正文以执行后处理。
- Plugin Sandbox 的 `console` 只输出对象的有界摘要。调试具体内容时应显式选择并序列化必要字段，不能把带自引用的完整 `ctx` 交给 DevTools 长期持有。
- 入口自行读取任意 `.chat.json`、容器或资源，处理上下文与 Regex，再决定是否调用模型。系统没有“主上下文入口”。
- JavaScript 可用 `imports.resource` / `resourceById` 动态读取资源；`imports.containers(scope, "depth:*")` 可按 glob 取得多个容器。

## 约定文件

- `manifest.json`：配置和 `generatePath`。
- `containers.json`：容器声明。
- `regex.json`：可由生成流程读取的规则。
- `*.chat.json`：角色消息数组，工作区提供结构化编辑器。
- `*.data.json`：隔离、初值、包装器和变量更新定义。
- `action/`、`tools/`、`background/`、`temp/`、`components/`：按 `插件系统.md` 的路径约定解释。

`.chat.json` 编译、`.data.json` 解析和编辑器均归 Plugin 所有。

## 内置插件

`builtIn/core` 是默认流程的可编辑源码：它读取压缩后的聊天记录和 `default.chat.json`，调用 `agent.prepare()`，显式创建 `ToolLoopAgent`，并把结果写入 Conversation 提供的空助手目标。

`builtIn/blank` 只有 `manifest.json` 与 `generate.js`，不声明容器，用于验证最小插件执行路径。

`application/builtin-plugins.ts` 把内置文件夹及 `.pulsar-plugin.json` 的路径元信息映射为数据库插件。恢复内置插件时重新读取这份发布源码。

`builtIn/` 是插件数据目录，不是应用 TypeScript 源码目录；`tsconfig.json` 明确排除其源码检查。Vite 仍通过 `application/builtin-plugins.ts` 的 `?raw` / `?url` glob 将这些数据打包进应用。

## 界面

- 会话界面的顶栏资产按钮控制主画布右侧概念区域内的 `PluginAssetTreePanel` 浮动卡片。卡片以绝对定位覆盖会话画布、从右侧移入，和窗口右缘及 `724px` 中间区域保持间隙，使用圆角、完整边框与有界最大高度，不改变消息线程或输入栏宽度。它只显示当前角色包的本地插件，以及该角色包启用或选为主要插件的全局插件；文件树直接来自 Plugin Store 的数据库节点，树区域使用共享 `ScrollArea`。
- 文件节点在 `PluginFileEditorDialog` 中打开；桌面端浮窗定位在资产面板左侧并允许双向拖拽缩放，内部编辑区随浮窗可用高度铺满；窄于 768px 时改为不可缩放的视口内全宽浮层。`PluginFileEditorSurface` 按精确约定路径和文件类型映射已有组件：`manifest.json`、`containers.json`、根 `regex.json`、`.chat.json` 使用结构化编辑器，Markdown 使用透明背景 Milkdown/Crepe，JavaScript、Vue、JSON 与数据文件使用 CodeMirror，媒体使用预览。所有保存仍通过 `pluginStore.updateNode()` 落到稳定节点。
- 桌面运行时继续通过 Tauri/SurrealDB 读写 `resource_plugins` / `resource_plugin_nodes`；纯 Vite 只装载发布内置插件。所有插件加载、保存、删除和节点搜索会写入批量 `[Pulsar DB]` 摘要日志，便于比较数据库接入前后的卡顿。

- 文件头使用一个可直接选择“不插入”或目标容器的选择器；条件使用 AND/OR 列表编辑器，并保留 `order` 调整。
- 深度 0 至 6 是普通内置容器，不重复实现一套数字编辑器。
- `containers.json` 编辑器使用紧凑卡片展示标题、ID、作用域、单行说明和后缀限制；资源明细按需展开，并保留稳定 ID 和路径导航。
