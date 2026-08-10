# Plugin

The built-in blank Plugin provides a fast, fine-grained mock stream for UI and persistence checks without calling a model. The focused stage's floating asset tree is height-bounded by the page and gives its tree body to the shared `ScrollArea`.

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
- `generation/model` 是固定模型配置键；值使用 `provider/modelId/thinkingLevel`，末段思考强度可省略。强度存在时映射到 AI SDK 顶层 `reasoning`，省略时由 Provider 自动决定；模型与强度都不写入 Conversation。
- `appearance/background` 只保存在内置核心 Plugin，值为去掉扩展名的插件内路径 ID，例如 `background/classroom`。候选资源必须注册到 `background` 容器；同一 ID 按角色本地、全局、内置顺序解析。
- manifest 的通用 `PathSelect` 通过 `props.pathRegex` 过滤插件内路径，选项和值隐藏已识别扩展名；可用 `props.containerId` 进一步限制容器。
- manifest 的 `ModelSelect` 配置组件保存可选思考末段的 `providerId/modelId/thinkingLevel`，并支持用 `props.apiType` 限制模型类型；主要插件仍从 Plugin 资产管理入口设置。
- manifest 的 Group 只保存稳定 ID 和标题，并在结构化编辑器中渲染为一级功能 Tab；Group 不保存描述、不渲染边框，字段自身仍保留标题、说明、组件属性和值。
- Conversation 创建空助手消息后，把原始消息、回复闭包、压缩记忆闭包、`imports`、Agent 与 Feature API 交给该入口。入口返回值不会写入消息；正文、内容部件、过程和模型标识必须通过 `reply` 写入。内置 Agent 使用 AI SDK 7 的 `runner.stream()` 与 `result.stream`，过程回调实时写入步骤，所有 step 的 `text-delta.text` 按到达顺序逐段追加正文；每段 reasoning 在结束后作为一个 `thinking` step 写入，避免按 token 创建大量步骤。流结束后仍可读取并覆盖完整正文以执行后处理。
- Plugin Sandbox 的 `console` 只输出对象的有界摘要。调试具体内容时应显式选择并序列化必要字段，不能把带自引用的完整 `ctx` 交给 DevTools 长期持有。
- 入口自行读取任意 `.chat.json`、容器或资源，处理上下文与 Regex，再决定是否调用模型。系统没有“主上下文入口”。
- JavaScript 可用 `imports.resource` / `resourceById` 动态读取资源；`imports.containers(scope, "depth:*")` 可按 glob 取得多个容器。

## 约定文件

- `manifest.json`：配置和 `generatePath`。
- `containers.json`：容器声明。
- `regex.json`：可由生成流程读取的规则。
- `*.chat.json`：角色消息数组，文件编辑器提供结构化编辑器。
- `*.data.json`：隔离、初值、包装器和变量更新定义。
- `action/`、`tools/`、`background/`、`temp/`、`components/`：按 `插件系统.md` 的路径约定解释。

`.chat.json` 编译、`.data.json` 解析和编辑器均归 Plugin 所有。

## 内置插件

`builtIn/core` 是默认流程的可编辑源码：它读取压缩后的聊天记录和 `default.chat.json`，调用 `agent.prepare()`，显式创建 `ToolLoopAgent`，并把结果写入 Conversation 提供的空助手目标。

`builtIn/blank` 只有 `manifest.json` 与 `generate.js`，不声明容器，用于验证最小插件执行路径。

`application/builtin-plugins.ts` 把内置文件夹及 `.pulsar-plugin.json` 的路径元信息映射为数据库插件。恢复内置插件时重新读取这份发布源码。

`builtIn/` 是插件数据目录，不是应用 TypeScript 源码目录；`tsconfig.json` 明确排除其源码检查。Vite 仍通过 `application/builtin-plugins.ts` 的 `?raw` / `?url` glob 将这些数据打包进应用。

SillyTavern 导入由 `src/features/Migrations/SillyTavern` 负责，Plugin 只接收已经转换和放置的目标树。角色卡写入包本地 `character/main.md`、`character/user/`、`lorebooks/` 与根 `regex.json`；未认领世界书写成独立全局 Plugin；仅 OpenAI Chat Completion 预设和背景扩展现有内置核心 Plugin。预设的绝对深度 prompt 与 `.chat.json` 放在同一入口目录，拆成带休眠 depth insertion 的 `.md`，避免未选择的多个预设一起生效。每个导入 Plugin 都保留 `migration/` 报告，未知字段和近似映射不得在 Plugin Store 中静默丢弃。

迁移文本里的简单 SillyTavern 宏和同步 ST-Prompt-Template EJS 在写入 Plugin 前已经变成普通 `{{ JavaScript }}`。Plugin resolver 只运行既有动态表达式，不识别外部模板语法；复杂或依赖外部 API 的模板被写成惰性注释并进入迁移诊断。

## 界面

- 会话界面的顶栏资产按钮控制主画布右侧概念区域内的 `PluginAssetTreePanel` 浮动卡片。卡片以绝对定位覆盖会话画布、从右侧移入，和窗口右缘及 `724px` 中间区域保持间隙，使用圆角、完整边框与根据可见节点数计算的有界高度，不改变消息线程或输入栏宽度。它将当前角色包的内置插件和全局插件分栏显示；根行只保留 Power 图标按钮，启用时使用绿色 SVG，停用时使用弱化图标。停用不影响展开和浏览文件。只有主要插件在图标按钮前显示皇冠，其他插件通过根行 `...` 菜单设为主要插件。文件树使用共享 `ScrollArea`，支持新建全部约定资源类型、新建文件夹、导入、复制路径、递归复制/粘贴、原地重命名、删除和同插件内拖拽移动；固定约定节点继续禁止改名、移动和删除。文件行紧贴名称显示插入容器标识。
- 文件节点在 `PluginFileEditorDialog` 中打开；桌面端初始居中，由 `interact.js` 限制在页面内，通过顶栏拖拽并直接从四边或四角缩放，不渲染额外控制点；窄于 768px 时改为不可缩放的视口内浮层。顶栏的插入选择器在下拉列表中以容器标题为主行并显示说明，选中后只显示容器标题；范围和稳定 ID 都不进入选中态文案。选择插入后显示条件列表菜单与 shadcn-vue Number Field 优先级输入；条件扫描深度同样使用 Number Field。内容和插入元信息合并为一次 800ms 防抖自动保存，底栏只显示上次保存时间或错误。`PluginFileEditorSurface` 按精确约定路径和文件类型映射已有组件：`manifest.json`、`containers.json`、根 `regex.json`、`.chat.json` 使用结构化编辑器，Markdown 使用无顶部工具栏的透明背景 Milkdown/Crepe，且保留普通 Enter 换行；Vue 提供组件预览，媒体使用媒体视图。上述文件每次打开都默认进入视图，只有没有可用视图的 JavaScript、普通 JSON、数据和文本文件默认进入 CodeMirror 源码；视图/源码切换只在确有两种模式时显示。所有保存仍通过 `pluginStore.updateNode()` 落到稳定节点。
- 桌面运行时继续通过 Tauri/SurrealDB 读写 `resource_plugins` / `resource_plugin_nodes`；纯 Vite 只装载发布内置插件。

- 文件头使用一个可直接选择“不插入”或目标容器的选择器；条件使用 AND/OR 列表编辑器，并保留 `order` 调整。
- 深度 0 至 6 是普通内置容器，不重复实现一套数字编辑器。
- `containers.json` 编辑器使用紧凑卡片展示标题、ID、作用域、单行说明和后缀限制；资源明细按需展开，并保留稳定 ID 和路径导航。
