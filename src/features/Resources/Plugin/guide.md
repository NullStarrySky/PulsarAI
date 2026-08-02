# 插件系统

PulsarAI 插件是一棵可持久化的文件树。插件不把全部文件自动注入模型或 JavaScript，而是通过入口文件、容器成员关系和显式引用，按需参与一次对话生成。

这种设计有三个目标：

- 插件内容保持普通文件形态，方便阅读、移动和组合；
- 模型只能看到当前生成流程明确使用的资源；
- 上下文编译、流程执行和模型调用保持一条可追踪的链路。

## 基本设计：用文档引用构建上下文

插件系统把 Markdown、JSON 格式的 `.data`、JavaScript、媒体和组件都视为有稳定 ID 与路径的普通资源。`containers.json` 只声明可见的命名空间，文件自己的 `memberships` 决定它属于哪些容器；资源自己的 `dataReferences` 元数据声明数据依赖；`context.md`、其他文档和流程脚本再通过 `<@...>` 显式引用需要的资源。

一次生成可以沿着一条直接可见的链路理解：

1. 索引当前角色包可见且启用的插件文件，不执行文件内容；
2. 从 `containers.json` 建立容器命名空间，把成员文件按优先级挂入容器；
3. 从根 `context.md` 出发，只解析它直接或间接引用的文档，并按资源元数据绑定 `.data`；
4. 把编译后的角色消息、授权 Feature API 文档与当前对话组成模型上下文；
5. 按优先级运行根 `regex.json` 中的正则规则，对最终消息列表做后处理；
6. 运行显式 `agentprocess/index.js`，由其中的 `ToolLoopAgent` 使用唯一的 CodeAct 工具调用上下文 API。

因此最终上下文不是“把插件全部塞给模型”，而是从入口文档出发遍历引用图得到的结果。资源 ID 用于稳定定位，路径便于人类与 Agent 继续向下查看；容器只负责按需组织，不做隐式注入。

![图片占位：插件文档引用图，展示 context.md、.data 元数据引用、containers.json、成员文档和 agentprocess 如何互相引用并形成最终上下文](/images/plugin-document-graph-placeholder.svg)

## 推荐目录结构

新插件会创建下面的基础结构：

```text
/
├─ info.md
├─ manifest.json
├─ containers.json
├─ regex.json
├─ context.md
├─ data/
│  └─ character.data
├─ instruction/
│  └─ default.md
├─ agentprocess/
│  ├─ index.js
│  ├─ step1-prepare.js
│  ├─ step2-generate.js
│  └─ step3-finalize.js
├─ tools/
│  └─ example/
│     ├─ tool.js
│     └─ prompt.md
├─ Override.vue
├─ components/
├─ character/
│  └─ default.md
├─ action/
└─ background/
```

推荐把稳定的插件说明放在 `info.md`，插件配置放在 `manifest.json`，容器拓扑放在 `containers.json`，消息后处理规则放在 `regex.json`，上下文模板放在 `context.md`，可复用 JSON 状态定义放在 `.data`，生成步骤放在 `agentprocess/`，CodeAct 可调用函数放在 `tools/`。根级 `Override.vue` 是默认对话渲染器的覆盖入口，`components/` 用来存放它和其他插件界面复用的 Vue 组件。

## 插件级属性

插件分为角色包本地插件和全局插件：

- 本地插件的 `packageId` 指向所属角色包；
- 全局插件的 `packageId` 为 `null`，由默认项管理；
- 每个角色包通过 `pluginId` 只拥有一个本地资源插件；
- 角色包通过 `mainPluginId` 显式选择负责根上下文和生成流程的本地或全局插件；
- `enabledGlobalPluginIds` 是无顺序的全局插件启用集合；
- 包内插件仍保存名称、图标和简介字段，但普通界面只把它显示为“角色资源”；全局插件继续显示这些元信息；
- `builtIn` 表示带默认快照的系统插件；它仍可编辑，并可随时“还原默认”。

一次生成索引唯一包内插件、显式主要插件和已启用全局插件。`context.md` 与 `agentprocess/index.js` 必须来自同一个主要插件，不再通过插件顺序分别选择。包内插件可以只保存角色文档，通过全局“会话上下文”容器把内容交给内置主要插件。

插件列表位于应用左侧栏，点击条目会直接打开独立插件工作区页面。插件之间不存在用户可配置顺序；Action、Tool 与全局容器命名冲突会明确失败。

获得 Plugin Feature 读取权限后，Agent 也可以直接查询和修改这组稳定配置：`plugin.getPackageConfiguration()` 返回 `pluginId`、`mainPluginId` 与 `enabledGlobalPluginIds`；`plugin.setMainPlugin(pluginId)` 切换主要插件；`plugin.setGlobalPluginEnabled(pluginId, enabled)` 控制当前角色包是否启用某个全局插件。`plugin.list()` 同时给出每个插件的 `id`、`packageId`、`local`、`main` 和 `active` 状态。

### 插件测试会话

打开插件或其中一个文件后，可以在右侧栏“任务”页签创建测试会话。测试会话是数据库中的 `Conversation`，使用 `kind: "test"` 和包含 `pluginId`、当前文件路径的资源绑定，不会写进插件文件树或随插件导出。

本地插件默认使用所属角色包运行；全局插件没有所属角色包，因此创建测试会话前需要选择一个已有角色包作为执行环境。测试运行会显式包含被绑定的插件，即使它当前没有参与普通对话。删除插件时，其关联测试会话也会删除。

## 文件模型与类型

每个树节点都有稳定 ID、名称、图标和树内顺序。文件额外保存内容和独立的数值优先级，默认优先级为 `100`。

文件类型由后缀决定：

| 后缀 | 类型 | 工作区渲染 |
| --- | --- | --- |
| `.md`、`.markdown` | Markdown | Milkdown/Crepe 所见即所得编辑 |
| `.data` | Data definition | JSON 定义编辑；隔离级别在文件内声明 |
| `.js`、`.mjs`、`.cjs`、`.ts` | JavaScript | CodeMirror |
| `.json` | JSON | CodeMirror 与 JSON 校验 |
| 常见图片、视频后缀 | Media | 图片或视频预览 |
| `.vue` | Component source | 原始内容与模板预览 |
| `.jsx`、`.tsx` | Component source | 代码编辑 |
| 其他后缀 | Text | 纯文本编辑 |

文件优先级不改变文件树显示顺序。它用于容器、Regex 和自定义工具收集：数值越大越靠前；相同优先级使用插件 ID、资源路径和资源 ID 作为无业务含义的稳定排序键。

Markdown 文件直接打开 Milkdown 所见即所得编辑器，不显示冗余的“原始内容/预览”切换。输入 `<@` 会补全当前可见引用，输入宏起始符会给出对应语法提示。源码切换只保留给 `.vue` 和拥有结构化覆盖渲染器的约定 JSON（例如 `regex.json`）。

## `info.md`

根目录 `info.md` 是插件的人类可读说明，建议至少记录：

- 插件解决的问题；
- 依赖的全局容器或 Feature API；
- 提供的容器、动作和背景；
- 适用的角色包或模型；
- 修改约束和兼容性说明。

`info.md` 没有隐式运行时权限。只有被入口、容器或显式引用使用时，它的内容才会进入解析链路。

## `manifest.json`

根目录 `manifest.json` 是唯一的插件配置文件，根类型固定为 `GroupContent[]`。组和配置项都有稳定 ID，配置值统一通过 `group.id/content.id` 寻址：

```json
[
  {
    "group": {
      "id": "appearance",
      "title": "外观"
    },
    "content": [
      {
        "id": "background",
        "title": "对话背景",
        "description": "选择当前角色使用的背景资源。",
        "component": "MediaSelect",
        "props": { "allowEmpty": true },
        "value": {
          "pluginId": "builtin-core-plugin",
          "path": "background/classroom.png"
        }
      }
    ]
  }
]
```

`component` 可以使用内置的 `Switch`、`Checkbox`、`Input`、`Textarea`、`Select`、`Slider` 和 `MediaSelect`，`props` 会传给对应的单体 shadcn 封装。也可以填写当前插件 `components/` 下的 Vue 组件名；自定义组件使用模板预览运行时，不执行 `<script>`，通过 `modelValue` 和 `update:modelValue` 收发值。所有 `value` 和 `props` 都必须是 JSON 值。

工作区根据完整文件名打开设置式预览，按组显示标题、说明和控件，并保留原始 JSON 视图供规范文件维护。`manifest.json` 固定在插件根目录，不能重命名、移动或删除。背景配置位于 `appearance/background`；目标插件、路径或媒体类型失效时会清除该值并回退到内置背景。系统不会迁移旧的自由对象格式。

Markdown 和其他显式引用位置使用同一套 ID 路径：

```text
<@config:local/appearance/background>
<@config:global/builtin-core-plugin/appearance/background>
```

`local` 指引用来源所在插件；`global` 必须携带已启用全局插件的稳定 ID。Agent 可用 `plugin.getPluginManifest(pluginId)` 查询文件 ID、路径、来源插件、GroupContent[] 和诊断，用 `plugin.resolveConfig(reference)` 解析同一种引用。插件流程还可用 `plugin.getManifest()`、`getConfig(groupId, contentId)`、`setConfig(...)` 与 `replaceManifest(...)` 维护自身配置。

## `containers.json`

根目录 `containers.json` 是容器声明和容器命名空间引用的唯一来源，根节点固定为带有 `containers` 数组的 JSON 对象。

```json
{
  "containers": [
    {
      "name": "角色上下文",
      "scope": "plugin",
      "description": "角色身份、表达方式与持续对话所需的上下文。",
      "imports": [
        {
          "alias": "base",
          "target": "container:global/基础上下文"
        }
      ]
    }
  ]
}
```

工作区会根据完整文件名在原始 JSON 和结构化编辑器之间切换。JSON 语法与字段错误会显示带路径的诊断；这个约定文件不能重命名、移动或删除。

每个容器可以添加一个可选的 `description`。说明不会成为容器成员，也不会自动进入模型上下文；它用于解释容器提供什么内容，并在 Markdown 编辑器的引用提示中帮助作者选择正确容器。

### 容器作用域

| 作用域 | 可见范围 |
| --- | --- |
| `root` | 插件根目录中的资源 |
| `plugin` | 当前插件中的资源 |
| `global` | 当前启用插件集合 |

短引用 `<@角色上下文>` 会依次检查当前根作用域、当前插件作用域和全局作用域。如果同名容器在多个可见作用域中同时存在，解析器会要求写成完整形式。

```text
<@container:root/局部上下文>
<@container:plugin/角色上下文>
<@container:global/基础上下文>
```

### 成员元数据

容器成员关系保存在文件节点的 `memberships` 元数据中，由文件属性面板管理，不写进 Markdown 或其他文件正文。成员可以附加本地配置条件：

```json
{
  "container": "container:plugin/角色上下文",
  "alias": "world",
  "condition": {
    "reference": "config:local/story/world",
    "equals": true
  }
}
```

条件省略 `equals` 时按配置值真假判断；填写时按 JSON 值相等判断。条件只接受 `config:local/group/content`，不允许用全局配置隐式控制另一个插件的成员注入。

`as` 是容器内的稳定别名。没有填写时，会使用不带后缀的文件名。别名冲突会产生诊断，不会静默覆盖。

容器值是惰性命名空间：

```js
const container = <@角色上下文>
const character = container.get("character")
const base = container.use("base")
const inventory = container.list()
```

- `get(alias)` 返回成员资源；
- `use(alias)` 返回导入的子容器；
- `list()` 返回可用成员别名和导入别名；
- 资源转换为字符串时才执行对应文件类型的渲染。

引用的容器始终保留命名空间，不会复制或把所有成员摊平到当前容器。“引用容器命名空间”只让当前容器通过 `use(alias)` 访问另一个既有容器。

### 查询容器

容器编辑器保持紧凑布局，说明只使用单行短句。展开某个容器的“详情”后，可以看到直接引用它的文档数量与列表，以及按运行时解析顺序得到的现有内容。列表会显示名称、插件内路径、来源插件和优先级；点击条目会打开对应插件并定位到文件。

获得 Plugin Feature 读取权限后，Agent 可以查询同一份运行时索引：

```js
const containers = plugin.listContainers()
const details = plugin.getContainer(containers[0].id)
```

`listContainers()` 返回容器查询 ID、定义文件 ID/路径、来源插件、使用数量和当前生效内容数量。`getContainer(containerId)` 的 `usedBy` 与 `contents` 条目都带有资源 `id`、插件内 `path`、`pluginId`、`pluginName`、文件类型和优先级；内容还会返回条件元数据，便于 Agent 继续读取文件树或使用显式 ID 引用。这里的“使用文档”只统计直接写有该容器引用的文件，不把间接依赖重复计数。

容器声明与内容关系也可以通过 `createContainer`、`updateContainer`、`removeContainer`、`addContainerContent`、`updateContainerContent` 和 `removeContainerContent` 完整维护。这些写入 API 只在插件流程中可用，并且只能修改当前插件。

![图片占位：容器详情页面，展示单行说明、使用文档列表、容器内容、来源插件、优先级和点击跳转](/images/plugin-container-details-placeholder.svg)

## `context.md` 与 `.data`

根目录 `context.md` 是角色感知的 Markdown 上下文入口。普通块默认是 system；需要显式角色时使用围栏：

```md
:::pulsar role=system
{{ <@角色上下文>.get("character") }}

[[chat]]
:::
```

`role` 可以是 `system`、`user` 或 `assistant`。`[[chat]]` 会把当前有效对话路径按原角色拼入消息序列。

上下文 Markdown 中可以使用：

- <code>&#123;&#123; expression &#125;&#125;</code>：把表达式结果渲染进当前文本；
- `[[ expression ]]`：把消息或数组拼入消息序列；
- `<@...>`：读取显式插件资源或容器。

在 Markdown 中输入 `<@` 后，编辑器会列出当前文档可见的容器。候选项包含容器名称、作用域、所属插件和可选说明；名称有歧义时会插入完整的 `container:scope/name` 引用。

`.data` 是独立 JSON 定义，内部声明 `resource` 或 `conversation` 隔离、初始值、说明与可选 updater wrapper。资源在属性面板通过 `{ alias, dataId }` 元数据引用它，Markdown 和 `.data` 正文都不记录引用路径。运行值属于 Conversation 分支，不会写回 `.data`。

普通 CodeAct 使用 `data.readForResource(resourceId, dataId)` 读取；`variable-update` 意图可使用 `data.writeForResource(resourceId, dataId, value)` 事务式写入。接口同时提供 ID 与路径信息，便于 Agent 顺着查询。

容器声明只从插件根级 `containers.json` 读取；其他资源中的相似 JSON 字段不属于插件格式，也不会被解析。成员关系只读取文件元数据。

如果所有启用插件都没有可用的根 `context.md`，生成流程使用只包含 `[[chat]]` 的回退上下文。

## `regex.json`

根级 `regex.json` 是正则容器的约定文件。新插件会把它关联到内置全局“正则”容器；运行时按完整根文件名发现规则，不需要把规则变成 Sandbox 全局变量。

```json
[
  {
    "find_regex": "/secret:\\s*\\S+/gi",
    "replace_regex": "secret: [hidden]",
    "range": "all",
    "depth_min": 1,
    "depth_max": "INF",
    "applyOnRending": true
  }
]
```

- `find_regex` 接受普通正则源码或 `/pattern/flags` 写法；普通源码默认全局替换；
- `replace_regex` 默认为空，支持 `$1` 等 JavaScript 替换分组；
- `range` 为 `user_input`、`ai_output` 或 `all`；
- 深度从最终消息列表末尾按 1 开始计算，`INF` 表示对应一侧不设边界，反向填写的数字边界也会自动规范为有效区间；
- 所有启用插件的根规则按文件优先级从高到低执行，同优先级使用稳定插件 ID 和资源 ID，单文件内部保持数组顺序；
- 生成阶段处理最终上下文中的全部有效规则；会话和任务面板只处理 `applyOnRending: true` 的规则，并且只改变显示结果，不改写数据库消息。

工作区会为根 `regex.json` 打开结构化编辑器。该约定文件不能重命名、移动或删除。无效 JSON、无效规则或无法编译的表达式会进入插件诊断，而不是中断整条消息历史。

## `agentprocess/`

`agentprocess/index.js` 是插件的生成流程入口。新插件默认使用三个步骤：

模型侧只暴露一个 `codeAct` 工具。每次调用必须提交一个显式包含 `return` 的 JavaScript 函数：

```js
async function () {
  const containers = plugin.listContainers()
  return containers.map(({ id, name, path }) => ({ id, name, path }))
}
```

函数在当前授权 Sandbox 环境中执行，可以组合多个 Feature API、Plugin API、`agent.callExtension(...)`、`agent.askUser(...)` 或 `api.askUser(...)`。成功时模型收到 `{ ok: true, value }`；语法、权限或运行错误会变为 `{ ok: false, error }`，模型可以根据错误修正下一次函数。原来的时间、用户提问、Skill 和 MCP 能力不再各自占用模型工具名：普通 JavaScript 可直接读取时间，用户提问和扩展调用都通过上下文 API 完成。

![图片占位：CodeAct 执行流程，展示模型生成带 return 的函数、Sandbox 调用 API、返回值或错误回到模型](/images/plugin-codeact-placeholder.svg)

```js
const messages = await api.runProcess(
  <@path:./step1-prepare.js>,
)

const result = await api.runProcess(
  <@path:./step2-generate.js>,
  { processInput: messages },
)

return api.runProcess(
  <@path:./step3-finalize.js>,
  { processInput: result },
)
```

默认步骤分别是：

```js
// step1-prepare.js
return contextMessages
```

```js
// step2-generate.js
const runtime = await agent.prepare()
const runner = new agent.ToolLoopAgent({
  model: runtime.model,
  reasoning: runtime.reasoning,
  instructions: [String(<@path:../instruction/default.md>), runtime.instructions].join("\n\n"),
  tools: runtime.tools,
  stopWhen: runtime.stopWhen,
  onStepStart: runtime.onStepStart,
})
const result = await runner.generate({ messages: processInput })
await runtime.finish()
return { text: result.text, modelName: runtime.modelName }
```

```js
// step3-finalize.js
return processInput
```

`api.runProcess(resource, overrides?)` 只接受当前脚本通过 `<@...>` 显式引用到的 JavaScript 资源。第二个参数会作为当前子步骤的环境覆盖层。流程递归调用会被拒绝，并给出调用路径。

JavaScript 文件不会执行 <code>&#123;&#123;...&#125;&#125;</code> 或 `[[...]]` 文本宏。JavaScript 使用原生语法组织控制流，只通过 `<@...>` 获得受保护的资源值：

```js
const rules = <@path:../rules.md>
const profile = <@container:plugin/角色上下文>.get("character")

return [...contextMessages, {
  role: "system",
  content: `${rules}\n\n${profile}`,
}]
```

常用流程环境包括：

- `contextMessages`：由 Feature API 文档和 `context.md` 编译出的消息；
- `chat` / `CHAT`：当前有效对话路径；
- `conversation`、`conversationId`、`packageId`、`containerId`；
- `reasoningEffort`：当前会话选择的 AI SDK 思考深度；
- `emptyContainer`、`emptyMessage`、`messageMeta`；
- `action`：当前动作名称；
- `prompt`：去除动作前缀后的用户输入；
- `skills.list()` / `mcp.list()` 与 `skills.call(...)` / `mcp.call(...)`：检查并调用扩展；`skills.tools`、`mcp.tools` 保留名称列表；
- `ctx.tools`：当前启用插件的自定义函数表；函数定义来自 `tools/<name>/tool.js`，使用说明来自同目录 `prompt.md`；
- 已授权 Feature API 与当前流程作用域内的 Plugin API；
- `agent`：Agent Feature API、`ToolLoopAgent` 构造器与惰性 `prepare()`；只有流程调用 `prepare()` 时才加载模型、当前思考深度、唯一 CodeAct 工具和生命周期钩子。

流程可以调用：

- `api.runProcess(resource, overrides?)`：运行另一个显式 JavaScript 步骤；
- `api.askUser(input)`：使用标准问题结构暂停 CodeAct 并等待用户回答；
- `api.askUserWithComponent(request)`：暂停当前流程并等待组件结果；
- `api.renderComponent(componentId, props?)`：把已注册组件加入回复；
- `api.modelConnection`：在对应能力存在时访问当前模型连接。

流程最终可以返回字符串或 `{ text, modelName }`。流程可以像内置范例一样实例化 Agent，也可以运行纯 JavaScript 或直接返回已有结果；系统不会暗中补跑 Agent。

入口选择为：

1. 当前消息选择的 `action/` 动作；
2. 当前角色包显式指定的主要插件的非空 `agentprocess/index.js`；其 `context.md` 也必须来自同一个插件；
3. 没有流程时明确报错，避免隐式执行不可见的默认逻辑。

## `tools/`

根级 `tools/` 保存插件自定义工具。只发现它的直接子目录，每个目录名就是工具名，并且必须同时包含：

```text
tools/
└─ lookupCharacter/
   ├─ tool.js
   └─ prompt.md
```

`tool.js` 的完整内容是一个函数。它可以接收普通参数，也可以像其他插件 JavaScript 一样使用已授权 Feature API、来源插件作用域内的 `plugin` API 和显式 `<@...>` 引用：

```js
async function lookupCharacter(name) {
  const tree = await plugin.getTree()
  return tree.filter((item) => item.name.includes(name))
}
```

`prompt.md` 写给模型阅读，应该明确参数、返回值、限制和适用场景：

```md
查询当前插件中的角色资源。

- 调用：`await ctx.tools.lookupCharacter(name)`
- 参数 `name`：角色名关键词
- 返回：带 `id` 和 `path` 的资源列表
```

生成开始时，系统会建立两个可检查的全局容器：

- `自定义工具`：对应每个 `tool.js`；
- `自定义工具文档`：对应每个 `prompt.md`。

工作区在约定目录中新建这两个文件时会自动写入对应成员元数据。运行时仍按精确目录结构发现它们，因此导入的旧插件不需要改写文件正文。

所有启用插件的工具按 `tool.js` 文件优先级从高到低收集，同优先级使用稳定插件 ID、目录顺序和资源 ID。同名工具会阻止生成并报告冲突，不采用先到或后写覆盖。说明文档先经过普通插件引用解析，再组成一个 `# 自定义工具` 系统区块，其中同时包含插件 ID、函数/说明资源 ID 与路径。

模型侧仍然只有 `codeAct` 一个工具。它从该文档区块读取定义，然后在 CodeAct 函数中调用：

```js
async function (ctx) {
  const result = await ctx.tools.lookupCharacter("Alice")
  return result
}
```

自定义函数在当前授权 Sandbox 中执行，且 `plugin` / `ctx.plugin` 指向函数来源插件的作用域 API。`tool.js` 或 `prompt.md` 缺失、函数格式错误、引用错误和命名冲突都会进入生成诊断。

## `Override.vue` 与 `components/`

根目录 `Override.vue` 是默认对话渲染器的唯一覆盖入口。它负责替换默认对话内容区域；不需要覆盖时保留默认的透传模板即可：

```vue
<template>
  <slot />
</template>
```

`components/` 专门保存插件 Vue 组件。`Override.vue` 可以组合这些组件，其他需要插件界面的入口也应优先复用这里的组件。工作区为所有 `.vue` 文件提供“原始内容/预览”切换。目前动态预览执行 `<template>` 并注册 `components/` 中的模板组件，不执行 `<script>`；状态和业务能力应通过受控插槽或 Feature API 提供。

`Override.vue` 和根级 `components/` 是固定约定，不能重命名、移动或删除。组件目录只决定源码归属，不会把文件自动注入 Sandbox 或模型上下文。

## `action/`

`action/` 下的 JavaScript 和 Markdown 文件都会成为输入框 `/` 菜单中的命令，文件名去掉后缀后作为命令名。

- JavaScript 命令沿用 Action：选中后显示命令标记，发送时保存一个开头的 `ActionPart`，并只替换本轮 `agentprocess/index.js`；
- Markdown 命令是输入模板：点击菜单项或直接提交完整 `/命令名` 时，把文件正文直接填入输入框，不发送消息、不生成 `ActionPart`，已有附件也会保留，用户可以继续编辑后再发送。

例如 `action/getTime.js`：

```js
return {
  text: new Date().toLocaleString(),
  modelName: "action:getTime",
}
```

一条用户消息最多保存一个动作，而且动作始终是消息的第一个 part。动作只替换当前这一次生成的流程入口，不修改插件的默认 `agentprocess/`。

动作脚本可以读取 `action` 和 `prompt`，也可以使用与普通流程相同的 `api`、Feature API 和显式资源引用。

## `background/`

`background/` 是媒体候选目录。所有后代图片和视频文件都可以按约定参与背景选择。

媒体文件内容保存 URL 或导入后的数据地址，类型由文件后缀和媒体信息共同判断。背景不是 CSS 片段，不会作为 Sandbox 变量注入。

## 其他目录

`character/`、`instruction/` 等目录是推荐的组织方式，不是固定容器。资源是否参与生成仍由成员元数据、`<@...>` 或入口文件决定。

流程中通过 `api.askUserWithComponent` 或 `api.renderComponent` 使用的生成组件仍需进入 generation component registry；它们和覆盖整个默认对话区域的 `Override.vue` 是两个不同入口。

## 显式引用

插件统一使用以下引用：

| 形式 | 含义 |
| --- | --- |
| `<@path:./file.md>` | 相对当前资源的路径 |
| `<@id:resource-id>` | 稳定资源 ID |
| `<@容器名>` | 唯一可见的同名容器 |
| `<@container:scope/name>` | 指定作用域的容器 |

路径不能越出当前插件根目录。ID 只能访问当前启用插件集合中的资源。

Markdown、文本和组件源码在转换为字符串时使用各自的渲染器。JavaScript 引用会变成受保护的资源值，而不是经过字符串宏替换。

## 诊断与可追踪性

以下情况会产生诊断或直接拒绝执行：

- 同作用域容器重名；
- 成员或导入别名冲突；
- 引用目标不存在或短名称有歧义；
- 相对路径越出插件根目录；
- 资源渲染循环；
- 流程脚本递归调用；
- `api.runProcess` 收到非显式引用资源或非 JavaScript 文件。

生成完成后，消息元数据会记录实际解析过的资源 ID 和链接诊断，便于检查某次回复使用了哪些插件资源。

## 推荐工作方式

1. 在 `info.md` 写清楚插件提供什么。
2. 在 `containers.json` 建立稳定的依赖拓扑。
3. 在文件属性中把资源加入容器并设置稳定别名。
4. 在资源元数据中绑定 `.data`，并在 `context.md` 只组装模型真正需要的上下文。
5. 在 `agentprocess/` 用普通 JavaScript 拆分准备、生成和收尾步骤。
6. 使用 `<@...>` 显式连接资源，不依赖隐式全局变量。
7. 用文件优先级表达容器成员顺序，用树顺序表达工作区组织顺序。
8. 查看生成消息的资源追踪和诊断，再调整依赖关系。
