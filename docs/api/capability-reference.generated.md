---
capabilityOutline: [{"id":"feature-docs","label":"Feature API 文档","children":[{"id":"feature-docs-notes","label":"使用说明"},{"id":"feature-docs-types","label":"类型"},{"id":"feature-docs-api","label":"API 定义"}]},{"id":"feature-about","label":"关于与环境检查","children":[{"id":"feature-about-notes","label":"使用说明"},{"id":"feature-about-types","label":"类型"},{"id":"feature-about-api","label":"API 定义"}]},{"id":"feature-agent","label":"Agent","children":[{"id":"feature-agent-notes","label":"使用说明"},{"id":"feature-agent-types","label":"类型"},{"id":"feature-agent-api","label":"API 定义"}]},{"id":"feature-backup","label":"版本管理","children":[{"id":"feature-backup-notes","label":"使用说明"},{"id":"feature-backup-types","label":"类型"},{"id":"feature-backup-api","label":"API 定义"}]},{"id":"feature-database","label":"数据库","children":[{"id":"feature-database-notes","label":"使用说明"},{"id":"feature-database-types","label":"类型"},{"id":"feature-database-api","label":"API 定义"}]},{"id":"feature-defaultConfigs","label":"默认配置","children":[{"id":"feature-defaultConfigs-notes","label":"使用说明"},{"id":"feature-defaultConfigs-types","label":"类型"},{"id":"feature-defaultConfigs-api","label":"API 定义"}]},{"id":"feature-hotkey","label":"命令与快捷键","children":[{"id":"feature-hotkey-notes","label":"使用说明"},{"id":"feature-hotkey-types","label":"类型"},{"id":"feature-hotkey-api","label":"API 定义"}]},{"id":"feature-misc","label":"运行环境","children":[{"id":"feature-misc-notes","label":"使用说明"},{"id":"feature-misc-types","label":"类型"},{"id":"feature-misc-api","label":"API 定义"}]},{"id":"feature-modelConnection","label":"模型连接","children":[{"id":"feature-modelConnection-notes","label":"使用说明"},{"id":"feature-modelConnection-types","label":"类型"},{"id":"feature-modelConnection-api","label":"API 定义"}]},{"id":"feature-notification","label":"通知","children":[{"id":"feature-notification-notes","label":"使用说明"},{"id":"feature-notification-types","label":"类型"},{"id":"feature-notification-api","label":"API 定义"}]},{"id":"feature-resources","label":"通用资源文件","children":[{"id":"feature-resources-notes","label":"使用说明"},{"id":"feature-resources-types","label":"类型"},{"id":"feature-resources-api","label":"API 定义"}]},{"id":"feature-sandbox","label":"代码执行","children":[{"id":"feature-sandbox-notes","label":"使用说明"},{"id":"feature-sandbox-types","label":"类型"},{"id":"feature-sandbox-api","label":"API 定义"}]},{"id":"feature-globals","label":"全局对象","children":[{"id":"feature-globals-notes","label":"使用说明"},{"id":"feature-globals-types","label":"类型"},{"id":"feature-globals-api","label":"API 定义"}]},{"id":"feature-setting","label":"设置目录","children":[{"id":"feature-setting-notes","label":"使用说明"},{"id":"feature-setting-types","label":"类型"},{"id":"feature-setting-api","label":"API 定义"}]},{"id":"feature-statistic","label":"统计","children":[{"id":"feature-statistic-notes","label":"使用说明"},{"id":"feature-statistic-types","label":"类型"},{"id":"feature-statistic-api","label":"API 定义"}]},{"id":"feature-subWindow","label":"子窗口","children":[{"id":"feature-subWindow-notes","label":"使用说明"},{"id":"feature-subWindow-types","label":"类型"},{"id":"feature-subWindow-api","label":"API 定义"}]},{"id":"feature-translate","label":"翻译","children":[{"id":"feature-translate-notes","label":"使用说明"},{"id":"feature-translate-types","label":"类型"},{"id":"feature-translate-api","label":"API 定义"}]},{"id":"feature-ui","label":"界面","children":[{"id":"feature-ui-notes","label":"使用说明"},{"id":"feature-ui-types","label":"类型"},{"id":"feature-ui-api","label":"API 定义"}]},{"id":"feature-webSearch","label":"网络搜索","children":[{"id":"feature-webSearch-notes","label":"使用说明"},{"id":"feature-webSearch-types","label":"类型"},{"id":"feature-webSearch-api","label":"API 定义"}]}]
editLink: false
---

# Pulsar Feature API

本文档由各 Feature 的 docs.ts 定义自动生成，说明可用场景、关键类型与公开 API。

<a id="feature-docs"></a>
## Feature API 文档

API 对象：`environment.docs`

查询当前 Feature API 注册表公开的 Feature 与函数元数据。

提供注册表自身的只读元数据；公开 API 始终可用，少数特殊操作由运行时策略封锁。

<a id="feature-docs-notes"></a>
### 使用说明

- list、get、read_docs 与人类文档使用同一份定义。
- 被策略封锁的函数不会出现在普通生成运行时中。

<a id="feature-docs-types"></a>
### 类型

#### FeatureApiDoc

一个公开函数的人类与模型共用说明。

```ts
interface FeatureApiDoc {
  name: string;
  signature: string;
  description: string;
  returns?: string;
  example?: string;
}
```

#### FeatureDocs

一个 Feature 的完整文档与 API 元数据。

```ts
interface FeatureDocs {
  id: string;
  title: string;
  description: string;
  documentation?: FeatureDocsDetail;
  api: FeatureApiDoc[];
}
```

#### ReadDocsResult

read_docs 根据参数返回目录、完整 Feature 定义、单个函数契约或 null。

```ts
type ReadDocsResult =
  | FeatureDocsEntry[]
  | FeatureDocsResult
  | FeatureApiDocResult
  | null;
```

<a id="feature-docs-api"></a>
### API 定义

##### `docs.list(): Promise<FeatureDocs[]>`

列出全部 Feature 的文档和 API 元数据。

**示例：**

```js
await docs.list()
```

##### `docs.get(featureId: string): Promise<FeatureDocs | null>`

按 Feature id 查询文档和 API 元数据。

**示例：**

```js
await docs.get('conversation')
```

##### `docs.read_docs(featureId?: string, apiName?: string): ReadDocsResult`

按需读取 Sandbox 中公开 Feature API 的目录、完整定义或单个函数契约。省略 featureId 返回目录；指定 featureId 返回该 Feature 的文档、类型、API 与可用状态；再指定 apiName 返回单个函数。

**返回：** 目录项数组、含每个函数 availability 的完整 Feature 定义、单个函数契约；未找到 Feature 或函数时返回 null。

**示例：**

```js
const api = read_docs('conversation', 'requestContainer');
```

<a id="feature-about"></a>
## 关于与环境检查

API 对象：`environment.about`

读取本地开发工具的可用状态。

用于诊断本机是否具备 Pulsar 外部工作流依赖的基础命令。目前检查 Node.js 与 Git，不执行安装或环境修复。

<a id="feature-about-notes"></a>
### 使用说明

- 检查通过 Tauri Shell 的预授权命令完成，不接受任意命令文本。
- 未安装工具时仍返回完整状态对象，并通过 error 字段说明检测失败原因。

<a id="feature-about-types"></a>
### 类型

#### EnvironmentToolStatus

单个开发工具的检测结果。

```ts
type EnvironmentToolStatus = {
  id: "nodejs" | "git";
  name: string;
  version: string;
  installed: boolean;
  installPath: string;
  error: string;
};
```

<a id="feature-about-api"></a>
### API 定义

##### `about.checkEnvironment(): Promise<EnvironmentToolStatus[]>`

检查应用已知的本地环境工具。

**示例：**

```js
await about.checkEnvironment()
```

<a id="feature-agent"></a>
## Agent

API 对象：`environment.agent`

在 CodeAct 上下文中查询并调用 Agent 扩展、询问用户及提示建议卡片。

ToolLoopAgent 只向模型暴露一个 codeAct 工具。Skill 与 MCP 扩展保留在 Agent 注册表中，并通过这里的普通上下文函数由 codeAct 调用。`agent.askUser` 和 `agent.askSuggestion` 可直接触发卡片组件并等待用户交互。

<a id="feature-agent-notes"></a>
### 使用说明

- 扩展不再作为独立模型工具出现，因此不会扩大模型工具列表。
- 省略 source 时会合并全部已注册扩展来源。
- callExtension 只调用已经注册且提供本地 execute 实现的扩展。
- askUser 支持单问题与 Approval Card 多问题排版。
- askSuggestion 用于展示 Recommendation Card 推荐与备选方案。

<a id="feature-agent-types"></a>
### 类型

#### AgentExtensionSource

当前支持的 Agent 扩展来源。

```ts
type AgentExtensionSource = "skill" | "mcp";
```

#### AgentExtensionSummary

可供 CodeAct 调用的扩展摘要。

```ts
type AgentExtensionSummary = {
  source: AgentExtensionSource;
  name: string;
  description?: string;
};
```

<a id="feature-agent-api"></a>
### API 定义

##### `agent.listTools(source?: AgentExtensionSource): string[]`

兼容接口：列出全部或指定来源的 Agent 扩展名称。

**示例：**

```js
agent.listTools('mcp')
```

##### `agent.listExtensions(source?: AgentExtensionSource): AgentExtensionSummary[]`

列出可在 CodeAct 上下文中调用的扩展及其说明。

**示例：**

```js
agent.listExtensions('skill')
```

##### `agent.callExtension(source: AgentExtensionSource, name: string, input: unknown): Promise<unknown>`

调用一个已注册扩展，并把返回值或错误交给当前 CodeAct 函数。

**示例：**

```js
await agent.callExtension('mcp', 'search', { query: 'PulsarAI' })
```

##### `agent.askUser(input: AskUserInput): Promise<AskUserResult>`

在 Approval Card 中弹出单问题或多问题表单并等待用户选择与输入。

**示例：**

```js
await agent.askUser({ questions: [{ question: '发布多少种口味？', options: ['3种', '5种'] }] })
```

##### `agent.askSuggestion(input: AskSuggestionInput): Promise<AskSuggestionResult>`

在 Recommendation Card 中展示推荐方案与 Alternatives 抽屉并等待用户确认。

**示例：**

```js
await agent.askSuggestion({ title: '确认补货订单？', options: [{ key: '1', short: '方案A', body: '详情...', signal: 3, label: '高置信度', cta: '接受' }] })
```

<a id="feature-backup"></a>
## 版本管理

API 对象：`environment.backup`

查询本地备份，或创建新的本地备份。恢复与删除不向模型 API 开放。

面向自动化流程开放低风险的版本查询与增量备份创建操作。灾难恢复、资源归档导入导出、差异合并和删除历史版本仍只能由用户界面发起。

<a id="feature-backup-notes"></a>
### 使用说明

- list 会先刷新本地备份目录，再返回最新状态。
- create 使用当前设置中的备份目录与保留数量，并将变化文件写入共享的 Zstandard 内容寻址对象库。
- 旧版目录备份保持可读；新备份的快照目录只保存引用压缩对象的清单。

<a id="feature-backup-types"></a>
### 类型

#### BackupInfo

一个可见本地备份的摘要。

```ts
interface BackupInfo {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  size: number;
}
```

<a id="feature-backup-api"></a>
### API 定义

##### `backup.list(): Promise<BackupInfo[]>`

刷新并返回当前备份目录中的历史版本。

**示例：**

```js
await backup.list()
```

##### `backup.create(): Promise<void>`

使用当前版本管理设置创建本地备份。

**示例：**

```js
await backup.create()
```

<a id="feature-database"></a>
## 数据库

API 对象：`environment.database`

访问 Pulsar 本地数据库的底层记录。除诊断或迁移外应优先使用所属 Feature 的高层 API。

这是 SurrealDB 记录层的通用逃生口，允许按表名直接读写值。它绕过所属 Feature 的业务校验，因此写入与删除默认被策略屏蔽。

<a id="feature-database-notes"></a>
### 使用说明

- 表名和记录结构不会在运行时替调用方推断，调用方必须掌握对应 Feature 的持久化契约。
- 写入与删除方法默认从运行时对象移除，仅在明确授权的环境中按需放开。

<a id="feature-database-types"></a>
### 类型

#### DatabaseRecord

selectAll 返回的记录包装结构。

```ts
interface DatabaseRecord<T> {
  id: string;
  value: T;
}
```

<a id="feature-database-api"></a>
### API 定义

##### `database.selectAll<T>(table: string): Promise<Array<{ id: string | null; value: T }>>`

读取一个表中的全部记录。

##### `database.selectOne<T>(table: string, id: string): Promise<T | null>`

按 id 读取单条记录。

##### `database.upsert<T>(table: string, id: string, value: T): Promise<void>`

新增或替换一条记录。

##### `database.remove(table: string, id: string): Promise<void>`

删除一条记录。

<a id="feature-defaultConfigs"></a>
## 默认配置

API 对象：`environment.defaultConfigs`

读取或修改 Pulsar 的非敏感默认配置。密钥不在此 API 中暴露。

管理新资源与未显式覆盖设置时采用的应用级默认值。聊天模型引用以 provider/model/thinkingLevel 字符串保存，末段可省略。

<a id="feature-defaultConfigs-notes"></a>
### 使用说明

- 可读取和写入默认聊天、快速、向量化、媒体与提示词优化配置。
- 模型连接密钥保存在独立 Secret 存储中，永远不会由此 Feature 返回。

<a id="feature-defaultConfigs-types"></a>
### 类型

#### DefaultConfigKey

允许通过公开 API 访问的默认配置键。

```ts
type DefaultConfigKey =
  | "defaultChatModel"
  | "fastModel"
  | "embeddingModel"
  | "imageModel"
  | "speechModel"
  | "transcriptionModel"
  | "promptOptimizationModel"
  | "promptOptimizationPrompt";
```

<a id="feature-defaultConfigs-api"></a>
### API 定义

##### `defaultConfigs.get(key: DefaultConfigKey): Promise<string>`

读取一个默认配置。

**返回：** 配置值。

**示例：**

```js
await defaultConfigs.get('defaultChatModel')
```

##### `defaultConfigs.set(key: DefaultConfigKey, value: string): Promise<void>`

写入一个默认配置。

**示例：**

```js
await defaultConfigs.set('fastModel', 'openai/gpt-4o-mini')
```

<a id="feature-hotkey"></a>
## 命令与快捷键

API 对象：`environment.hotkey`

查询或执行已经注册到 Pulsar 的命令。

命令注册表把可搜索命令、菜单动作和快捷键入口统一为稳定的 commandId。自动化代码应先查询命令，再按 id 执行。

<a id="feature-hotkey-notes"></a>
### 使用说明

- 执行行为仍由命令所属 Feature 的 actions.ts 负责。
- 默认快捷键是显示元数据，用户实际绑定可能已在外观或快捷键设置中调整。

<a id="feature-hotkey-types"></a>
### 类型

#### CommandSummary

命令目录返回的轻量元数据。

```ts
interface CommandSummary {
  id: string;
  title: string;
  description?: string;
  category?: string;
  defaultHotkey?: string;
}
```

<a id="feature-hotkey-api"></a>
### API 定义

##### `hotkey.listCommands(): CommandSummary[]`

列出命令 id、标题、说明、分类和默认快捷键。

**示例：**

```js
hotkey.listCommands()
```

##### `hotkey.execute(commandId: string): Promise<void>`

按 id 执行一个已注册命令。

**示例：**

```js
await hotkey.execute('ui.open-settings')
```

<a id="feature-misc"></a>
## 运行环境

API 对象：`environment.misc`

读取当前运行平台，或发送一条本地通知。

汇集少量不适合独立建模的运行时能力，包括平台识别、回复完成通知和 Android 系统导航栏外观同步。

<a id="feature-misc-notes"></a>
### 使用说明

- 平台信息来自 Tauri OS 适配层，适合选择行为分支，不应作为安全判断。
- 移动端导航栏设置在非 Android 平台返回 false，不会模拟成功。

<a id="feature-misc-types"></a>
### 类型

#### PlatformInfo

当前桌面或移动运行环境的摘要。

```ts
interface PlatformInfo {
  platform: string;
  osType: string;
  family: string;
  arch: string;
  version: string;
}
```

#### MobileNavigationBarMode

Android 系统导航栏的外观策略。

```ts
type MobileNavigationBarMode =
  | "topbar"
  | "system"
  | "light"
  | "dark";
```

<a id="feature-misc-api"></a>
### API 定义

##### `misc.getPlatform(): PlatformInfo`

返回平台、系统类型、系统家族、架构和版本。

**返回：** { platform, osType, family, arch, version }

**示例：**

```js
misc.getPlatform()
```

##### `misc.notify(input?: { title?: string; body?: string }): Promise<void>`

在系统允许时发送本地通知。

**示例：**

```js
await misc.notify({ title: '完成', body: '任务已处理' })
```

##### `misc.setMobileNavigationBar(mode: 'topbar' | 'system' | 'light' | 'dark'): Promise<boolean>`

仅 Android 生效。topbar 会跟随当前顶栏明暗模式。

**示例：**

```js
await misc.setMobileNavigationBar('topbar')
```

<a id="feature-modelConnection"></a>
## 模型连接

API 对象：`environment.modelConnection`

通过已经配置的模型连接执行简洁的文本生成。API 不暴露提供商密钥。

使用现有 ModelConnection 与默认模型配置执行一次无工具文本生成，适合摘要、改写和分类等短任务。

<a id="feature-modelConnection-notes"></a>
### 使用说明

- 省略 model 时使用默认聊天模型，显式模型值使用 provider/model/thinkingLevel 引用格式，末段可省略。
- 此入口不创建 Agent，也不启动插件流程或工具循环。

<a id="feature-modelConnection-types"></a>
### 类型

#### GenerateTextInput

一次简单文本生成请求。

```ts
interface GenerateTextInput {
  prompt: string;
  model?: string;
  system?: string;
}
```

#### GenerateTextResult

公开给调用方的最小生成结果。

```ts
interface GenerateTextResult {
  text: string;
}
```

<a id="feature-modelConnection-api"></a>
### API 定义

##### `modelConnection.generateText(input: { prompt: string; model?: string; system?: string }): Promise<{ text: string }>`

使用指定模型或默认聊天模型生成文本。

**示例：**

```js
await modelConnection.generateText({ prompt: '总结这段内容' })
```

<a id="feature-notification"></a>
## 通知

API 对象：`environment.notification`

发送系统外部通知或写入 Pulsar 内置通知中心。

统一处理应用内通知记录与操作系统通知。internal 通道持久化到内置通知中心，external 通道会先请求系统权限。

<a id="feature-notification-notes"></a>
### 使用说明

- 外部通知是默认投递方式，但不会自动复制一份到内置通知中心。
- 读取只返回通知元数据和正文，不会改变 read 状态。

<a id="feature-notification-types"></a>
### 类型

#### NotificationLevel

内置通知使用的语义级别。

```ts
type NotificationLevel =
  | "info"
  | "success"
  | "warning"
  | "error";
```

#### PulsarNotification

内置通知中心保存的通知记录。

```ts
interface PulsarNotification {
  id: string;
  title: string;
  body: string;
  level: NotificationLevel;
  createdAt: string;
  read: boolean;
}
```

<a id="feature-notification-api"></a>
### API 定义

##### `notification.list(): PulsarNotification[]`

列出内置通知，最新通知在前。

**示例：**

```js
notification.list()
```

##### `notification.sendInternal(input: { title?: string; body?: string; level?: NotificationLevel }): Promise<PulsarNotification>`

将通知写入 Pulsar 内置通知中心。

**示例：**

```js
await notification.sendInternal({ title: '完成', body: '任务已完成' })
```

##### `notification.sendExternal(input: { title?: string; body?: string }): Promise<boolean>`

请求系统通知权限并发送外部通知。

**示例：**

```js
await notification.sendExternal({ title: '完成' })
```

<a id="feature-resources"></a>
## 通用资源文件

API 对象：`environment.resources`

处理资源文件 URL，或删除已经保存的资源文件。

为各类资源共享的本地文件提供显示地址转换和物理删除操作。它不负责数据库记录、资源树关系或 Feature 业务状态。

<a id="feature-resources-notes"></a>
### 使用说明

- displayUrl 可安全处理空地址，适合直接用于可选媒体预览。
- deleteFile 只应接收由资源文件服务保存并返回的地址。

<a id="feature-resources-types"></a>
### 类型

#### ResourceFileUrl

资源文件服务保存的本地地址。公开 API 使用 string 表示。

```ts
type ResourceFileUrl = string;
```

<a id="feature-resources-api"></a>
### API 定义

##### `resources.displayUrl(fileUrl?: string): string`

把本地资源地址转换为可显示的 URL。

**示例：**

```js
resources.displayUrl(fileUrl)
```

##### `resources.deleteFile(fileUrl: string): Promise<void>`

删除一个已经保存的资源文件。

**示例：**

```js
await resources.deleteFile(fileUrl)
```

<a id="feature-sandbox"></a>
## 代码执行

API 对象：`environment.sandbox`

执行局部 JavaScript 辅助逻辑。危险方法由运行时策略按需屏蔽。

执行短小 JavaScript 表达式或语句，用于数据转换、条件判断和组合运行时可用的 Feature API。它是应用级权限边界，不是操作系统安全沙箱。

<a id="feature-sandbox-notes"></a>
### 使用说明

- values 中的键会作为本次代码执行的局部变量，并优先于普通全局对象。
- 浏览器高风险全局对象由独立的 globals 对象控制。

<a id="feature-sandbox-types"></a>
### 类型

#### SandboxValues

一次执行显式注入的局部变量。

```ts
type SandboxValues = Record<string, unknown>;
```

<a id="feature-sandbox-api"></a>
### API 定义

##### `sandbox.execute(code: string, values?: Record<string, unknown>): Promise<unknown>`

使用可选局部变量执行 JavaScript。

**示例：**

```js
await sandbox.execute('items.map(x => x.id)', { items })
```

<a id="feature-globals"></a>
## 全局对象

API 对象：`environment.globals`

Sandbox JavaScript 对浏览器全局对象的直接访问。被屏蔽对象仍提供可识别的 Proxy 占位，并在读取、调用或写入时抛出权限错误。

把具有网络、持久化、页面控制、跨上下文或动态代码生成能力的浏览器对象整体开放；需要收紧时由运行时策略按需屏蔽。

<a id="feature-globals-notes"></a>
### 使用说明

- window、self 与 globalThis 只暴露同一份过滤后的对象视图。
- 被屏蔽对象会在访问时抛出明确权限错误，但这不等同于隔离同一 JavaScript Realm 中的恶意代码。

<a id="feature-globals-types"></a>
### 类型

#### ControlledGlobalGroup

高风险浏览器全局对象的分组。

```ts
type ControlledGlobalGroup =
  | "network"
  | "storage"
  | "page"
  | "workers"
  | "codeGeneration";
```

<a id="feature-globals-api"></a>
### API 定义

##### `globals.fetch(input, init?): Promise<Response>`

访问浏览器网络请求相关全局对象；也可直接使用 fetch、WebSocket 或 XMLHttpRequest。

##### `globals.localStorage: Storage`

访问浏览器存储相关全局对象。

##### `globals.document: Document`

访问页面、地址、导航器、父窗口和打开窗口等广泛的浏览器能力。

##### `globals.Worker: typeof Worker`

创建 Worker 或跨上下文消息通道。

##### `globals.Function: FunctionConstructor`

允许通过 eval 或 Function 动态编译代码。

<a id="feature-setting"></a>
## 设置目录

API 对象：`environment.setting`

查询 Pulsar 已注册的设置页面与一级功能 Tab。

读取设置导航的注册信息，适合发现可打开页面或生成帮助说明。它不会返回任何设置值、模型密钥或其他 Secret。

<a id="feature-setting-notes"></a>
### 使用说明

- pages 按设置导航顺序返回；tabs 是页面内部可选的一级功能划分。
- 需要读取具体配置时应使用该配置所属 Feature 的公开 API。

<a id="feature-setting-types"></a>
### 类型

#### SettingTabMeta

设置页面内部的一级功能 Tab。

```ts
interface SettingTabMeta {
  id: string;
  title: string;
}
```

#### SettingPageMeta

设置页面的公开导航元数据。

```ts
interface SettingPageMeta {
  id: string;
  title: string;
  tabs: SettingTabMeta[];
}
```

#### SettingDirectory

设置注册表的公开只读形状。

```ts
interface SettingDirectory {
  pages: SettingPageMeta[];
}
```

<a id="feature-setting-api"></a>
### API 定义

##### `setting.list(): SettingDirectory`

按导航顺序列出设置页面与一级功能 Tab，不返回配置值或密钥。

**示例：**

```js
setting.list()
```

<a id="feature-statistic"></a>
## 统计

API 对象：`environment.statistic`

读取不含消息正文的本地使用统计。

提供本地资源规模的聚合视图，用于展示存储占用和消息数量。统计结果不包含消息文本、附件内容或模型凭据。

<a id="feature-statistic-notes"></a>
### 使用说明

- 首次调用会初始化统计存储并读取最新聚合值。
- sizeByType 与 sizeByPackage 的单位由统计存储统一维护，调用方不应自行混用其他单位。

<a id="feature-statistic-types"></a>
### 类型

#### StatisticSizeEntry

一个资源类型或角色包的存储占用条目。

```ts
interface StatisticSizeEntry {
  id: string;
  label: string;
  bytes: number;
  color: string;
}
```

#### StatisticSummary

公开的本地使用统计摘要。

```ts
interface StatisticSummary {
  messageCount: number;
  sizeByType: StatisticSizeEntry[];
  sizeByPackage: StatisticSizeEntry[];
}
```

<a id="feature-statistic-api"></a>
### API 定义

##### `statistic.summary(): Promise<StatisticSummary>`

返回消息数量及按资源类型、角色包聚合的存储大小。

**示例：**

```js
await statistic.summary()
```

<a id="feature-subWindow"></a>
## 子窗口

API 对象：`environment.subWindow`

将资源或已注册组件打开到独立窗口。

通过统一目标协议把资源、内置页面或组件弹出为 Tauri WebviewWindow。目标数据会被编码到子窗口启动参数中。

<a id="feature-subWindow-notes"></a>
### 使用说明

- resource 目标需要资源类型与 id，component 目标只接受已注册组件 id。
- 重复目标的窗口标签由协议稳定生成，调用方不应自行拼接 WebviewWindow label。

<a id="feature-subWindow-types"></a>
### 类型

#### SubWindowTarget

可由公开 API 打开的三类子窗口目标。

```ts
type SubWindowTarget =
  | {
      type: "resource";
      resourceType: string;
      resourceId: string;
      packageId?: string;
      title?: string;
      resourceParams?: Record<string, unknown>;
    }
  | {
      type: "builtin";
      resourceId: string;
      title?: string;
      resourceParams?: Record<string, unknown>;
    }
  | {
      type: "component";
      componentId: string;
      title?: string;
      props?: Record<string, unknown>;
    };
```

<a id="feature-subWindow-api"></a>
### API 定义

##### `subWindow.open(target: SubWindowTarget, title?: string): Promise<void>`

按资源、内置页面或组件目标打开子窗口。

**示例：**

```js
await subWindow.open({ type: 'resource', resourceType: 'plugin', resourceId: id })
```

<a id="feature-translate"></a>
## 翻译

API 对象：`environment.translate`

使用当前翻译设置处理文本。

复用用户当前选择的翻译提供商、源语言和目标语言完成文本翻译。读取配置时只返回非敏感字段。

<a id="feature-translate-notes"></a>
### 使用说明

- text 不接受临时语言覆盖，调用前应先通过 getConfig 确认当前方向。
- 提供商密钥来自 Translate 自己的设置与 Secret 管理，不会出现在返回值中。

<a id="feature-translate-types"></a>
### 类型

#### TranslateConfig

公开的当前翻译配置。

```ts
interface TranslateConfig {
  sourceLanguage: string;
  targetLanguage: string;
  provider: string;
}
```

<a id="feature-translate-api"></a>
### API 定义

##### `translate.text(value: string): Promise<string>`

使用当前提供商与语言设置翻译文本。

**示例：**

```js
await translate.text('Hello')
```

##### `translate.getConfig(): { sourceLanguage: string; targetLanguage: string; provider: string }`

读取不含密钥的当前翻译配置。

**示例：**

```js
translate.getConfig()
```

<a id="feature-ui"></a>
## 界面

API 对象：`environment.ui`

控制设置窗口和会话输入框工具栏。

提供应用壳层的设置入口和输入框工具栏布局。领域操作仍由对应 Feature 自己负责。

<a id="feature-ui-notes"></a>
### 使用说明

- 工具栏布局中的每个已知工具只保留一次，缺失工具会按默认分区补回。

<a id="feature-ui-types"></a>
### 类型

#### ComposerToolId

当前输入框工具栏目录中的工具标识。

```ts
type ComposerToolId =
  | "model"
  | "optimize"
  | "attachment"
  | "whiteboard"
  | "map"
  | "fullscreen";
```

#### ComposerToolbarLayout

输入框工具在左侧、右侧与未使用分区中的顺序。

```ts
interface ComposerToolbarLayout {
  left: ComposerToolId[];
  right: ComposerToolId[];
  unused: ComposerToolId[];
}
```

<a id="feature-ui-api"></a>
### API 定义

##### `ui.setSettingsOpen(open: boolean): void`

打开或关闭设置窗口。

**示例：**

```js
ui.setSettingsOpen(true)
```

##### `ui.getComposerToolbar(): ComposerToolbarLayout`

读取输入框工具栏的 left、right 和 unused 数组。

**示例：**

```js
ui.getComposerToolbar()
```

##### `ui.setComposerToolbar(layout: ComposerToolbarLayout): void`

保存输入框工具栏布局；每个已知工具只会保留一次。

**示例：**

```js
ui.setComposerToolbar({ left: ['attachment'], right: ['model', 'map', 'fullscreen'], unused: ['whiteboard', 'optimize'] })
```

<a id="feature-webSearch"></a>
## 网络搜索

API 对象：`environment.webSearch`

通过已启用的 Playwright Chromium 或 Exa 搜索提供商执行网页搜索，返回可引用的结果摘要。

网络搜索在设置中选择已启用提供商：Playwright 使用 Rust 侧隔离的 headless Chromium，Exa 使用 Exa Search API。前端和 Sandbox 不接触浏览器、driver、WebDriver 或 API Key 明文。

<a id="feature-webSearch-notes"></a>
### 使用说明

- Playwright 仅支持桌面端，并要求已安装匹配版本的 Playwright Chromium。
- Exa API Key 保存为 Secret，并且只由原生请求层写入 x-api-key。
- 移动端可使用已启用的 Exa；不提供浏览器自动化搜索。
- 结果来自搜索结果页，调用方应在回答前按需打开并核实来源。

<a id="feature-webSearch-types"></a>
### 类型

#### WebSearchResult

搜索结果的最小可序列化表示。

```ts
interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}
```

<a id="feature-webSearch-api"></a>
### API 定义

##### `webSearch.search(input: { query: string; limit?: number }): Promise<WebSearchResult[]>`

使用设置中的活动提供商执行关键词搜索，最多返回 10 条结果。

**示例：**

```js
await webSearch.search({ query: 'PulsarAI', limit: 5 })
```
