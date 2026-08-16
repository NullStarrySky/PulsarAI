# Plugin

The built-in blank Plugin provides a fast, fine-grained mock stream for UI and persistence checks without calling a model. The focused stage's floating asset tree is height-bounded by the page and gives its tree body to the shared `ScrollArea`.

`插件系统.md` 是插件架构的唯一事实来源。本文件只记录源码落点。

## 数据与文件

- `resource_plugins` 保存插件元信息，`resource_plugin_nodes` 保存稳定文件节点；路径不是身份。
- 文件节点使用 `treeOrder` 排列文件树，使用 `order` 排列容器内容。
- 每个文件最多有一个 `insertion: { target: string; condition?: string }`。条件列表保存为一个同步 JavaScript 布尔表达式，执行时可使用当前资源的 `imports` 以及 `include`、`exclude`、`probability`。
- `insertion.conditionPath` 可选指向相对当前资源解析的 JavaScript 文件；它与内联 `condition` 同时满足才会插入，脚本必须同步返回 boolean，并在相同只读条件环境中运行。
- `containers.json` 声明 `{ id, title, scope, description, contentSuffixes }`。容器只是注册表，不自动参与生成。
- `contentSuffixes` 支持复合后缀、`*` 和 `media`；空数组不接受资源。
- 容器成员的完整路径是 `<pluginId>/<插件内路径>`；插件 ID 是可编辑的顶层路径段，同名文件不会跨插件冲突。

## 运行

- `manifest.json` 的 `runtime/generatePath` 指向唯一生成入口。缺少入口的插件不能设为主要插件；路径存在但不是有效 `.js` 文件时直接报错。
- `generation/model` 是固定模型配置键；值使用 `provider/modelId/thinkingLevel`，末段思考强度可省略。强度存在时映射到 AI SDK 顶层 `reasoning`，省略时由 Provider 自动决定；模型与强度都不写入 Conversation。
- `appearance/background` 只保存在内置核心 Plugin，值为去掉扩展名的插件内路径 ID，例如 `background/classroom`。候选资源必须注册到 `background` 容器；同一 ID 按角色本地、全局、内置顺序解析。
- manifest 的通用 `PathSelect` 通过 `props.pathRegex` 过滤插件内路径，选项和值隐藏已识别扩展名；可用 `props.containerId` 进一步限制容器。
- manifest 的 `ModelSelect` 配置组件保存可选思考末段的 `providerId/modelId/thinkingLevel`，并支持用 `props.apiType` 限制模型类型；主要插件仍从 Plugin 资产管理入口设置。
- manifest 的 Group 只保存稳定 ID 和标题，并在结构化编辑器中渲染为一级功能 Tab；Group 不保存描述、不渲染边框，字段自身仍保留标题、说明、组件属性和值。
- Conversation 创建空助手消息后，把原始消息、回复闭包、压缩记忆闭包、`imports`、Agent 与 Feature API 交给该入口。入口返回值不会写入消息；正文、内容部件、过程和模型标识必须通过 `reply` 写入。内置 Agent 使用 AI SDK 7 的 `runner.stream()` 与 `result.stream`，过程回调实时写入步骤，所有 step 的 `text-delta.text` 按到达顺序逐段追加正文；每段 reasoning 在结束后作为一个 `thinking` step 写入，避免按 token 创建大量步骤。流结束后仍可读取并覆盖完整正文以执行后处理。
- Plugin Sandbox 的 `console` 只输出对象的有界摘要。调试具体内容时应显式选择并序列化必要字段，不能把带自引用的完整 `ctx` 交给 DevTools 长期持有。
- 入口自行读取任意 `.chat.json`、容器或资源，处理上下文与 Regex，再决定是否调用模型。系统没有“主上下文入口”。
- 绝大部分插件脚本直接使用顶层免前缀 FS 函数：`read`, `write`, `edit`, `ls`, `exists`, `mkdir`, `move`, `remove`, `import`, `run`, `test`, `test_condition`, `grep` 以及 URI 路径前缀（`@/` 表示本地插件，`@<pluginId>/` 表示目标插件）。
- `import(path, env)` 与 `container.import` 通过 `environment` 中的 `stack`（调用栈）与 `logger`（Trace 日志对象）自动维护递归调用链与循环引用检测。导入前探查 `stack`，发生自我嵌套时抛出循环引用错误；解析前注入 `$file` 元数据（支持文档内引用自身的 `$file.name`, `$file.path` 等）。
- `test(path, env)` 直接返回解析结果 `value` 与全量 Trace 日志 `logs` / `formattedText`；资源编辑器面板（`PluginParseResultTree.vue`）提供纯文本 Trace 日志阅读器，支持勾选“层级缩进”。
- `test_condition(code, env)` 保留用作单例条件规则的独立调试。
- 容器 API 收拢在 `container.*` (`list`, `get`, `read`, `import`)；配置 API 收拢在 `config.*` (`list`, `get`, `set`)。
- 动态引入 ES 模块与脚本使用 `import("@/...")`；容器与配置引入使用 `container.import(...)` 与 `config.get(...)`；静态依赖解析由 `findPluginImportCalls` 自动搜集匹配。

## 约定文件

- `manifest.json`：配置和 `generatePath`。
- `containers.json`：容器声明。
- `regex.json`：可由生成流程读取的规则。
- `*.chat.json`：角色消息数组，文件编辑器提供结构化编辑器。
- `*.data.json`：隔离、初值、包装器和可写 Data 状态定义；运行值是会话 Overlay 中的纯 JSON，不回写定义文件。
- `cache/`：插件可管理的可再生缓存目录；缓存内容不应成为唯一业务状态。
- `temp/`：会话/媒体等短期派生资源目录；TTS 消息朗读缓存按消息内容哈希写入这里，编辑消息后不会命中旧缓存。
- `skill/`：Skill Markdown 文档目录。向 `Skill` 容器注册后，生成提示词只注入名称和单行描述；运行时用 `read_skill(name)` 按需读取完整内容。
- `COMMAND` 容器中的 `.js`、`.md`、`.vue` 文件是输入框命令：JavaScript 作为临时生成流程执行，Markdown 填入输入框，Vue 打开组件视图。命令名来自文件名（去扩展名）。
- `character` 与 `user` 是全局角色信息容器，后者描述用户扮演的角色。
- `action/`、`tools/`、`background/`、`temp/`、`components/`：按 `插件系统.md` 的路径约定解释。

`.chat.json` 编译、`.data.json` 解析和编辑器均归 Plugin 所有。

生成沙箱中的文件写入与插件编辑器保存语义不同：编辑器继续通过 `pluginStore` 修改基础插件节点；生成期的 `write/edit/mkdir/move/remove/config.set` 只修改当前 Conversation Overlay，并与 `.data` 包装器的替换操作一同记录到当前消息版本。活动路径重放这些操作后才构造 resolver；CodeAct 失败会整批回滚，且生成期不会对单独文件触发自动保存。Overlay 不创建、移动或删除插件根。

## 内置插件

`builtIn/core` 是默认流程的可编辑源码：它读取压缩后的聊天记录和 `default.chat.json`，通过 `new agent.ToolLoopAgent({ container: reply })` 创建 Conversation 绑定的运行器，并调用 `await runner.stream({ messages })`。运行器自动准备模型与工具并把模型名、流式正文和 thinking 步骤写入空助手目标。

Plugin 可将短生命周期的动态视图写入 `temp/<Filename>.vue`。消息 Markdown 以独占一行的 `<Filename.vue />` 引用该文件；渲染器只从生成该消息的 Plugin 的 `temp/` 直接子文件读取，Vue runtime 仅编译 `<template>`，不执行组件脚本。`temp/` 同时可保存可再生的音频等缓存，不进入安装包语义。

`builtIn/blank` 只有 `manifest.json` 与 `generate.js`，不声明容器，用于验证最小插件执行路径。

`tree/builtin-plugins.ts` 把内置文件夹及 `.pulsar-plugin.json` 的路径元信息映射为数据库插件。恢复内置插件时重新读取这份发布源码。

`builtIn/` 是插件数据目录，不是应用 TypeScript 源码目录；`tsconfig.json` 明确排除其源码检查。Vite 仍通过 `tree/builtin-plugins.ts` 的 `?raw` / `?url` glob 将这些数据打包进应用。

SillyTavern 导入由 `src/features/Migrations/SillyTavern` 负责，Plugin 只接收已经转换和放置的目标树。角色卡写入包本地 `character/main.md`、`character/user/`、`lorebooks/` 与根 `regex.json`；未认领世界书写成独立全局 Plugin；仅 OpenAI Chat Completion 预设和背景扩展现有内置核心 Plugin。预设的绝对深度 prompt 与 `.chat.json` 放在同一入口目录，拆成带休眠 depth insertion 的 `.md`，避免未选择的多个预设一起生效。每个导入 Plugin 都保留 `migration/` 报告，未知字段和近似映射不得在 Plugin Store 中静默丢弃。

迁移文本里的简单 SillyTavern 宏和同步 ST-Prompt-Template EJS 在写入 Plugin 前已经变成普通 `{{ JavaScript }}`。Plugin resolver 只运行既有动态表达式，不识别外部模板语法；复杂或依赖外部 API 的模板被写成惰性注释并进入迁移诊断。

## 界面

- 会话顶栏把资产和插件拆成两个入口。资产按钮只打开当前角色包本地插件的 `PluginAssetTreePanel`，面板标题及根行显示“本地”，不混入全局插件；插件按钮打开 `PluginManagerPanel`，按本地/全局列出插件，可在其中启停、设为主要插件及重命名。点击任一插件会打开该插件自身的资产面板。资产卡片以绝对定位覆盖会话画布、从右侧移入，和窗口右缘及 `724px` 中间区域保持间隙，使用圆角、完整边框与根据可见节点数计算的有界高度，不改变消息线程或输入栏宽度。文件树使用共享 `ScrollArea`，支持新建全部约定资源类型、新建文件夹、导入、复制路径、递归复制/粘贴、原地重命名、删除和同插件内拖拽移动；固定约定节点继续禁止改名、移动和删除。文件行紧贴名称显示插入容器标识。
- 文件节点在 `PluginFileEditorDialog` 中打开；桌面端初始居中，由 `interact.js` 限制在页面内，通过顶栏拖拽并直接从四边或四角缩放，不渲染额外控制点；窄于 768px 时改为不可缩放的视口内浮层。顶栏的插入选择器在下拉列表中以容器标题为主行并显示说明，选中后只显示容器标题；范围和稳定 ID 都不进入选中态文案。选择插入后显示条件列表菜单与 shadcn-vue Number Field 优先级输入；条件扫描深度同样使用 Number Field。内容和插入元信息合并为一次 800ms 防抖自动保存，底栏只显示上次保存时间或错误。`PluginFileEditorSurface` 按精确约定路径和文件类型映射已有组件：`manifest.json`、`containers.json`、根 `regex.json`、`.chat.json` 使用结构化编辑器，Markdown 使用无顶部工具栏的透明背景 Milkdown/Crepe，且保留普通 Enter 换行；Vue 提供组件预览，媒体使用媒体视图。上述文件每次打开都默认进入视图，只有没有可用视图的 JavaScript、普通 JSON、数据和文本文件默认进入 CodeMirror 源码；视图/源码切换只在确有两种模式时显示。所有保存仍通过 `pluginStore.updateNode()` 落到稳定节点。
- 桌面运行时继续通过 Tauri/SurrealDB 读写 `resource_plugins` / `resource_plugin_nodes`；纯 Vite 只装载发布内置插件。

- 文件头使用一个可直接选择“不插入”或目标容器的选择器；条件使用 AND/OR 列表编辑器，并保留 `order` 调整。
- 深度 0 至 6 是普通内置容器，不重复实现一套数字编辑器。
- `containers.json` 编辑器使用紧凑卡片展示标题、ID、作用域、单行说明和后缀限制；资源明细按需展开，并保留稳定 ID 和路径导航。
