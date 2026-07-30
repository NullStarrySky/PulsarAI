# 插件系统

PulsarAI 插件是一棵可持久化的文件树。插件不把全部文件自动注入模型或 JavaScript，而是通过入口文件、容器成员关系和显式引用，按需参与一次对话生成。

这种设计有三个目标：

- 插件内容保持普通文件形态，方便阅读、移动和组合；
- 模型只能看到当前生成流程明确使用的资源；
- 上下文编译、流程执行和模型调用保持一条可追踪的链路。

## 推荐目录结构

新插件会创建下面的基础结构：

```text
/
├─ info.md
├─ manifest.json
├─ containers.xml
├─ context.imd
├─ instruction/
│  └─ default.md
├─ agentprocess/
│  ├─ index.js
│  ├─ step1-prepare.js
│  ├─ step2-generate.js
│  └─ step3-finalize.js
├─ Override.vue
├─ components/
├─ character/
│  └─ default.md
├─ action/
└─ background/
```

推荐把稳定的插件说明放在 `info.md`，插件配置放在 `manifest.json`，容器拓扑放在 `containers.xml`，上下文模板放在 `context.imd`，生成步骤放在 `agentprocess/`。根级 `Override.vue` 是默认对话渲染器的覆盖入口，`components/` 用来存放它和其他插件界面复用的 Vue 组件。

## 插件级属性

插件分为角色包本地插件和全局插件：

- 本地插件的 `packageId` 指向所属角色包；
- 全局插件的 `packageId` 为 `null`，由默认项管理；
- `enabled` 决定插件是否参与当前角色包的索引；
- 本地插件可以标记为主要插件；
- `builtIn` 表示带默认快照的系统插件；它仍可编辑，并可随时“还原默认”。

一次生成只索引当前角色包可见且启用的插件。本地插件优先，外部全局插件按角色包保存的顺序参与，内置全局兜底插件最后参与。

### 插件测试会话

打开插件或其中一个文件后，可以在右侧栏“任务”页签创建测试会话。测试会话是数据库中的 `Conversation`，使用 `kind: "test"` 和包含 `pluginId`、当前文件路径的资源绑定，不会写进插件文件树或随插件导出。

本地插件默认使用所属角色包运行；全局插件没有所属角色包，因此创建测试会话前需要选择一个已有角色包作为执行环境。测试运行会显式包含被绑定的插件，即使它当前没有参与普通对话。删除插件时，其关联测试会话也会删除。

## 文件模型与类型

每个树节点都有稳定 ID、名称、图标和树内顺序。文件额外保存内容和独立的数值优先级，默认优先级为 `100`。

文件类型由后缀决定：

| 后缀 | 类型 | 工作区渲染 |
| --- | --- | --- |
| `.md`、`.markdown` | Markdown | Milkdown/Crepe 编辑与 Markdown 渲染 |
| `.imd` | Interactive Document | 模板、数据、源码与预览 |
| `.js`、`.mjs`、`.cjs`、`.ts` | JavaScript | CodeMirror |
| `.json` | JSON | CodeMirror 与 JSON 校验 |
| 常见图片、视频后缀 | Media | 图片或视频预览 |
| `.vue` | Component source | 原始内容与模板预览 |
| `.jsx`、`.tsx` | Component source | 代码编辑 |
| 其他后缀 | Text | 纯文本编辑 |

文件优先级不改变文件树显示顺序。它用于容器收集成员时的排序：数值越大越靠前；相同优先级保留启用插件顺序和树扫描顺序。

Markdown 文件默认打开预览。文件栏右侧可以切换“原始内容”和“预览”：预览使用带背景、限制阅读宽度的文档页面；原始内容使用等宽编辑器，并高亮 `<@...>`、<code>&#123;&#123;...&#125;&#125;</code> 与 `[[...]]`。输入 `<@` 会补全当前可见引用，输入宏起始符会给出对应语法提示。

## `info.md`

根目录 `info.md` 是插件的人类可读说明，建议至少记录：

- 插件解决的问题；
- 依赖的全局容器或 Feature API；
- 提供的容器、动作和背景；
- 适用的角色包或模型；
- 修改约束和兼容性说明。

`info.md` 没有隐式运行时权限。只有被入口、容器或显式引用使用时，它的内容才会进入解析链路。

## `manifest.json`

根目录 `manifest.json` 是预留的插件配置文件。当前配置结构尚未开放，因此新插件只保存空对象：

```json
{}
```

工作区根据完整文件名使用插件配置编辑器，并进行 JSON 语法校验。`manifest.json` 固定在插件根目录，不能重命名、移动或删除。当前运行时不从中读取配置；以后正式开放配置项时，应继续在这个文件中扩展，不再另建并行配置文件。

## `containers.xml`

根目录 `containers.xml` 是容器声明和容器命名空间引用的唯一来源，类似插件自己的依赖清单。

```xml
<containers>
  <container name="角色上下文" scope="plugin">
    <description>角色身份、表达方式与持续对话所需的上下文。</description>
    <include as="base">container:global/基础上下文</include>
  </container>
</containers>
```

工作区会根据完整文件名为它打开结构化编辑器。这个约定文件不能重命名、移动或删除。

每个容器可以添加一个可选的 `<description>`。说明不会成为容器成员，也不会自动进入模型上下文；它用于解释容器提供什么内容，并在 IMD 编辑器的引用提示中帮助作者选择正确容器。

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

容器成员关系保存在文件节点的 `memberships` 元数据中，由文件属性面板管理，不写进 Markdown、IMD 或其他文件正文。

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

## `context.imd`

根目录 `context.imd` 是角色感知的上下文入口。它使用 Interactive Document 格式，可以包含多个带角色的模板：

```html
<prompt_template name="main" role="system">
{{ <@角色上下文>.get("character") }}

[[chat]]
</prompt_template>

<data>
</data>
```

`role` 可以是 `system`、`user` 或 `assistant`。`[[chat]]` 会把当前有效对话路径按原角色拼入消息序列。

Interactive Document 中可以使用：

- <code>&#123;&#123; expression &#125;&#125;</code>：把表达式结果渲染进当前文本；
- `[[ expression ]]`：把消息或数组拼入消息序列；
- `<@local:name>`：读取当前 `.imd` 的本地数据；
- `<@...>`：读取显式插件资源或容器。

在 IMD 模板中输入 `<@` 后，编辑器会列出当前文档可见的容器。候选项包含容器名称、作用域、所属插件和可选说明；名称有歧义时会插入完整的 `container:scope/name` 引用。上下方向键用于选择，`Enter` 或 `Tab` 用于插入。当前文档的 `<data>` 项也会进入同一提示，并显示自己的说明。

容器声明只从插件根级 `containers.xml` 读取；写在 `.imd` 或其他资源中的 `<container>` 不属于插件格式，也不会被解析。成员关系只读取文件元数据。

如果所有启用插件都没有可用的根 `context.imd`，生成流程使用只包含 `[[chat]]` 的回退上下文。

## `agentprocess/`

`agentprocess/index.js` 是插件的生成流程入口。新插件默认使用三个步骤：

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
  instructions: String(<@path:../instruction/default.md>),
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

- `contextMessages`：由 Feature API 文档和 `context.imd` 编译出的消息；
- `chat` / `CHAT`：当前有效对话路径；
- `conversation`、`conversationId`、`packageId`、`containerId`；
- `emptyContainer`、`emptyMessage`、`messageMeta`；
- `action`：当前动作名称；
- `prompt`：去除动作前缀后的用户输入；
- `skills.tools`、`mcp.tools`：当前注册的扩展工具名称；
- 已授权 Feature API。
- `agent`：Agent Feature 提供的 `ToolLoopAgent` 构造器与惰性 `prepare()`；只有流程调用 `prepare()` 时才加载模型、工具和生命周期钩子。

流程可以调用：

- `api.runProcess(resource, overrides?)`：运行另一个显式 JavaScript 步骤；
- `api.askUserWithComponent(request)`：暂停当前流程并等待组件结果；
- `api.renderComponent(componentId, props?)`：把已注册组件加入回复；
- `api.modelConnection`：在对应能力存在时访问当前模型连接。

流程最终可以返回字符串或 `{ text, modelName }`。流程可以像内置范例一样实例化 Agent，也可以运行纯 JavaScript 或直接返回已有结果；系统不会暗中补跑 Agent。

入口优先级为：

1. 当前消息选择的 `action/` 动作；
2. 第一个启用插件的非空 `agentprocess/index.js`；
3. 没有流程时明确报错，避免隐式执行不可见的默认逻辑。

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

`action/` 下的 JavaScript 文件会成为输入框 `/` 菜单中的动作。文件名去掉后缀后作为命令名。

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
| `<@local:name>` | 当前 `.imd` 的本地数据 |
| `<@path:./file.md>` | 相对当前资源的路径 |
| `<@id:resource-id>` | 稳定资源 ID |
| `<@容器名>` | 唯一可见的同名容器 |
| `<@container:scope/name>` | 指定作用域的容器 |

路径不能越出当前插件根目录。ID 只能访问当前启用插件集合中的资源。

Markdown、文本、组件源码和 Interactive Document 在转换为字符串时使用各自的渲染器。JavaScript 引用会变成受保护的资源值，而不是经过字符串宏替换。

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
2. 在 `containers.xml` 建立稳定的依赖拓扑。
3. 在文件属性中把资源加入容器并设置稳定别名。
4. 在 `context.imd` 只组装模型真正需要的上下文。
5. 在 `agentprocess/` 用普通 JavaScript 拆分准备、生成和收尾步骤。
6. 使用 `<@...>` 显式连接资源，不依赖隐式全局变量。
7. 用文件优先级表达容器成员顺序，用树顺序表达工作区组织顺序。
8. 查看生成消息的资源追踪和诊断，再调整依赖关系。
