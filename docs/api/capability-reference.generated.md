---
capabilityOutline: [{"id":"feature-capabilitySystem","label":"权限与 API 文档","children":[{"id":"feature-capabilitySystem-notes","label":"使用说明"},{"id":"feature-capabilitySystem-types","label":"类型"},{"id":"feature-capabilitySystem-api","label":"API 定义"}]},{"id":"feature-about","label":"关于与环境检查","children":[{"id":"feature-about-notes","label":"使用说明"},{"id":"feature-about-types","label":"类型"},{"id":"feature-about-api","label":"API 定义"}]},{"id":"feature-agent","label":"Agent","children":[{"id":"feature-agent-notes","label":"使用说明"},{"id":"feature-agent-types","label":"类型"},{"id":"feature-agent-api","label":"API 定义"}]},{"id":"feature-backup","label":"版本管理","children":[{"id":"feature-backup-notes","label":"使用说明"},{"id":"feature-backup-types","label":"类型"},{"id":"feature-backup-api","label":"API 定义"}]},{"id":"feature-database","label":"数据库","children":[{"id":"feature-database-notes","label":"使用说明"},{"id":"feature-database-types","label":"类型"},{"id":"feature-database-api","label":"API 定义"}]},{"id":"feature-defaultConfigs","label":"默认配置","children":[{"id":"feature-defaultConfigs-notes","label":"使用说明"},{"id":"feature-defaultConfigs-types","label":"类型"},{"id":"feature-defaultConfigs-api","label":"API 定义"}]},{"id":"feature-hotkey","label":"命令与快捷键","children":[{"id":"feature-hotkey-notes","label":"使用说明"},{"id":"feature-hotkey-types","label":"类型"},{"id":"feature-hotkey-api","label":"API 定义"}]},{"id":"feature-misc","label":"运行环境","children":[{"id":"feature-misc-notes","label":"使用说明"},{"id":"feature-misc-types","label":"类型"},{"id":"feature-misc-api","label":"API 定义"}]},{"id":"feature-modelConnection","label":"模型连接","children":[{"id":"feature-modelConnection-notes","label":"使用说明"},{"id":"feature-modelConnection-types","label":"类型"},{"id":"feature-modelConnection-api","label":"API 定义"}]},{"id":"feature-notification","label":"通知","children":[{"id":"feature-notification-notes","label":"使用说明"},{"id":"feature-notification-types","label":"类型"},{"id":"feature-notification-api","label":"API 定义"}]},{"id":"feature-resources","label":"通用资源文件","children":[{"id":"feature-resources-notes","label":"使用说明"},{"id":"feature-resources-types","label":"类型"},{"id":"feature-resources-api","label":"API 定义"}]},{"id":"feature-component","label":"组件资源","children":[{"id":"feature-component-notes","label":"使用说明"},{"id":"feature-component-types","label":"类型"},{"id":"feature-component-api","label":"API 定义"}]},{"id":"feature-interactiveDoc","label":"交互式文档","children":[{"id":"feature-interactiveDoc-notes","label":"使用说明"},{"id":"feature-interactiveDoc-types","label":"类型"},{"id":"feature-interactiveDoc-api","label":"API 定义"}]},{"id":"feature-preset","label":"预设流程","children":[{"id":"feature-preset-notes","label":"使用说明"},{"id":"feature-preset-types","label":"类型"},{"id":"feature-preset-api","label":"API 定义"}]},{"id":"feature-sandbox","label":"代码执行","children":[{"id":"feature-sandbox-notes","label":"使用说明"},{"id":"feature-sandbox-types","label":"类型"},{"id":"feature-sandbox-api","label":"API 定义"}]},{"id":"feature-globals","label":"全局对象","children":[{"id":"feature-globals-notes","label":"使用说明"},{"id":"feature-globals-types","label":"类型"},{"id":"feature-globals-api","label":"API 定义"}]},{"id":"feature-setting","label":"设置目录","children":[{"id":"feature-setting-notes","label":"使用说明"},{"id":"feature-setting-types","label":"类型"},{"id":"feature-setting-api","label":"API 定义"}]},{"id":"feature-statistic","label":"统计","children":[{"id":"feature-statistic-notes","label":"使用说明"},{"id":"feature-statistic-types","label":"类型"},{"id":"feature-statistic-api","label":"API 定义"}]},{"id":"feature-subWindow","label":"子窗口","children":[{"id":"feature-subWindow-notes","label":"使用说明"},{"id":"feature-subWindow-types","label":"类型"},{"id":"feature-subWindow-api","label":"API 定义"}]},{"id":"feature-translate","label":"翻译","children":[{"id":"feature-translate-notes","label":"使用说明"},{"id":"feature-translate-types","label":"类型"},{"id":"feature-translate-api","label":"API 定义"}]},{"id":"feature-ui","label":"界面","children":[{"id":"feature-ui-notes","label":"使用说明"},{"id":"feature-ui-types","label":"类型"},{"id":"feature-ui-api","label":"API 定义"}]}]
editLink: false
---

# Pulsar Feature API

本文档由各 Feature 的 capabilities 定义自动生成，说明可用场景、关键类型、权限边界与公开 API。

<a id="feature-capabilitySystem"></a>
## 权限与 API 文档

API 对象：`environment.capabilitySystem`

查询当前权限系统公开的 Feature、子权限与 API 元数据。

提供权限注册表自身的只读元数据，便于工具检查 Feature id、权限标识与函数说明。读取元数据不会授予被查询 Feature 的执行权限。

<a id="feature-capabilitySystem-notes"></a>
### 使用说明

- list 和 get 返回的对象与设置、模型提示词和文档生成器使用同一份定义。
- all 是配置时的便捷授权，运行时会展开为该 Feature 的全部显式子权限。

<a id="feature-capabilitySystem-types"></a>
### 类型

#### CapabilityApiDoc

一个公开函数的人类与模型共用说明。

```ts
interface CapabilityApiDoc {
  name: string;
  signature: string;
  description: string;
  returns?: string;
  example?: string;
}
```

#### CapabilityTypeDoc

人类文档中展示的 TypeScript 类型片段。

```ts
interface CapabilityTypeDoc {
  name: string;
  description?: string;
  definition: string;
}
```

#### CapabilityHumanDocumentation

只进入人类文档的 Feature 介绍、说明与类型清单。

```ts
interface CapabilityHumanDocumentation {
  overview: string;
  notes?: string[];
  types?: CapabilityTypeDoc[];
}
```

#### CapabilityDefinition

一个 Feature 的完整权限、文档与 API 元数据。

```ts
interface CapabilityDefinition {
  id: string;
  title: string;
  description: string;
  documentation?: CapabilityHumanDocumentation;
  subCaps: Record<string, string>;
  api: Record<string, CapabilityApiDoc[]>;
}
```

#### CapabilityGrants

按 Feature id 保存的子权限授权表。

```ts
type CapabilityGrants = Record<string, string[]>;
```

<a id="feature-capabilitySystem-api"></a>
### API 定义

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部权限元数据权限 |
| `read` | 读取权限与 API 文档 |

#### 读取权限与 API 文档

权限标识：`read`

##### `capabilitySystem.list(): Promise<CapabilityDefinition[]>`

列出全部 Feature 的权限和 API 元数据。

**示例：**

```js
await capabilitySystem.list()
```

##### `capabilitySystem.get(featureId: string): Promise<CapabilityDefinition | null>`

按 Feature id 查询权限和 API 元数据。

**示例：**

```js
await capabilitySystem.get('conversation')
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

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部环境检查权限 |
| `checkEnvironment` | 检查开发环境 |

#### 检查开发环境

权限标识：`checkEnvironment`

##### `about.checkEnvironment(): Promise<EnvironmentToolStatus[]>`

检查应用已知的本地环境工具。

**示例：**

```js
await about.checkEnvironment()
```

<a id="feature-agent"></a>
## Agent

API 对象：`environment.agent`

在 CodeAct 上下文中查询并调用 Agent 扩展。

ToolLoopAgent 只向模型暴露一个 codeAct 工具。Skill 与 MCP 扩展保留在 Agent 注册表中，并通过这里的普通上下文函数由 codeAct 调用。

<a id="feature-agent-notes"></a>
### 使用说明

- 扩展不再作为独立模型工具出现，因此不会扩大模型工具列表。
- 省略 source 时会合并全部已注册扩展来源。
- callExtension 只调用已经注册且提供本地 execute 实现的扩展。

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

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部 Agent 权限 |
| `readTools` | 读取并调用 Agent 扩展 |

#### 读取并调用 Agent 扩展

权限标识：`readTools`

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

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部已开放的版本管理权限 |
| `read` | 读取备份列表 |
| `create` | 创建本地备份 |

#### 读取备份列表

权限标识：`read`

##### `backup.list(): Promise<BackupInfo[]>`

刷新并返回当前备份目录中的历史版本。

**示例：**

```js
await backup.list()
```

#### 创建本地备份

权限标识：`create`

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

这是 SurrealDB 记录层的通用逃生口，允许按表名直接读写值。它绕过所属 Feature 的业务校验，因此默认权限应保持保守。

<a id="feature-database-notes"></a>
### 使用说明

- 表名和记录结构不会在运行时替调用方推断，调用方必须掌握对应 Feature 的持久化契约。
- 删除权限与写入权限分离，便于只允许迁移脚本新增或更新数据。

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

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部数据库权限 |
| `read` | 读取数据库记录 |
| `write` | 写入数据库记录 |
| `delete` | 删除数据库记录 |

#### 读取数据库记录

权限标识：`read`

##### `database.selectAll<T>(table: string): Promise<Array<{ id: string; value: T }>>`

读取一个表中的全部记录。

##### `database.selectOne<T>(table: string, id: string): Promise<T | null>`

按 id 读取单条记录。

#### 写入数据库记录

权限标识：`write`

##### `database.upsert<T>(table: string, id: string, value: T): Promise<void>`

新增或替换一条记录。

#### 删除数据库记录

权限标识：`delete`

##### `database.remove(table: string, id: string): Promise<void>`

删除一条记录。

<a id="feature-defaultConfigs"></a>
## 默认配置

API 对象：`environment.defaultConfigs`

读取或修改 Pulsar 的非敏感默认配置。密钥不在此 API 中暴露。

管理新资源与未显式覆盖设置时采用的应用级默认值。模型引用以 provider/model 字符串保存，权限默认值不通过此 API 修改。

<a id="feature-defaultConfigs-notes"></a>
### 使用说明

- 可读取和写入默认聊天、快速、向量化与图片生成模型。
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
  | "imageModel";
```

<a id="feature-defaultConfigs-api"></a>
### API 定义

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部默认配置权限 |
| `read` | 读取默认配置 |
| `write` | 修改默认配置 |

#### 读取默认配置

权限标识：`read`

##### `defaultConfigs.get(key: DefaultConfigKey): Promise<string>`

读取一个默认配置。

**返回：** 配置值。

**示例：**

```js
await defaultConfigs.get('defaultChatModel')
```

#### 修改默认配置

权限标识：`write`

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

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部命令权限 |
| `read` | 读取命令 |
| `execute` | 执行命令 |

#### 读取命令

权限标识：`read`

##### `hotkey.listCommands(): CommandSummary[]`

列出命令 id、标题、说明、分类和默认快捷键。

**示例：**

```js
hotkey.listCommands()
```

#### 执行命令

权限标识：`execute`

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

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部运行环境权限 |
| `readPlatform` | 读取平台信息 |
| `notify` | 发送本地通知 |
| `mobileNavigationBar` | 设置移动端系统导航栏 |

#### 读取平台信息

权限标识：`readPlatform`

##### `misc.getPlatform(): PlatformInfo`

返回平台、系统类型、系统家族、架构和版本。

**返回：** { platform, osType, family, arch, version }

**示例：**

```js
misc.getPlatform()
```

#### 发送本地通知

权限标识：`notify`

##### `misc.notify(input?: { title?: string; body?: string }): Promise<void>`

在系统允许时发送本地通知。

**示例：**

```js
await misc.notify({ title: '完成', body: '任务已处理' })
```

#### 设置移动端系统导航栏

权限标识：`mobileNavigationBar`

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

- 省略 model 时使用默认聊天模型，显式模型值使用 provider/model 引用格式。
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

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部模型连接权限 |
| `generateText` | 生成文本 |

#### 生成文本

权限标识：`generateText`

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
- 读取权限只返回通知元数据和正文，不会改变 read 状态。

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

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部通知权限 |
| `read` | 读取内置通知 |
| `sendInternal` | 发送内置通知 |
| `sendExternal` | 发送系统通知 |

#### 读取内置通知

权限标识：`read`

##### `notification.list(): PulsarNotification[]`

列出内置通知，最新通知在前。

**示例：**

```js
notification.list()
```

#### 发送内置通知

权限标识：`sendInternal`

##### `notification.sendInternal(input: { title?: string; body?: string; level?: NotificationLevel }): Promise<PulsarNotification>`

将通知写入 Pulsar 内置通知中心。

**示例：**

```js
await notification.sendInternal({ title: '完成', body: '任务已完成' })
```

#### 发送系统通知

权限标识：`sendExternal`

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

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部通用资源文件权限 |
| `read` | 解析资源显示地址 |
| `delete` | 删除资源文件 |

#### 解析资源显示地址

权限标识：`read`

##### `resources.displayUrl(fileUrl?: string): string`

把本地资源地址转换为可显示的 URL。

**示例：**

```js
resources.displayUrl(fileUrl)
```

#### 删除资源文件

权限标识：`delete`

##### `resources.deleteFile(fileUrl: string): Promise<void>`

删除一个已经保存的资源文件。

**示例：**

```js
await resources.deleteFile(fileUrl)
```

<a id="feature-component"></a>
## 组件资源

API 对象：`environment.component`

生成 Pulsar 组件资源的基础内容。

创建一个可以继续编辑的 Vue 单文件组件模板。返回值只是源码文本，不会自动保存资源或执行组件脚本。

<a id="feature-component-notes"></a>
### 使用说明

- name 只用于模板中的初始展示文本，调用方仍需通过所属资源 Feature 完成持久化。
- 插件动态预览对脚本执行有独立限制，生成模板不代表获得运行权限。

<a id="feature-component-types"></a>
### 类型

#### ComponentSource

完整 Vue SFC 源码。

```ts
type ComponentSource = string;
```

<a id="feature-component-api"></a>
### API 定义

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部组件资源权限 |
| `createTemplate` | 创建组件模板 |

#### 创建组件模板

权限标识：`createTemplate`

##### `component.createTemplate(name?: string): string`

返回一个可编辑的默认 Vue 组件资源。

**示例：**

```js
component.createTemplate('CounterButton')
```

<a id="feature-interactiveDoc"></a>
## 交互式文档

API 对象：`environment.interactiveDoc`

把 SFC 风格的交互式文档源码编译为角色消息和 Markdown。

解析 .imd 源码中的 prompt_template、data、sub_data 与显式资源引用，生成可加入上下文的角色消息和可预览 Markdown。

<a id="feature-interactiveDoc-notes"></a>
### 使用说明

- 编译过程不会隐式扫描资源，外部数据必须通过显式引用进入。
- 返回 errors 时调用方应先展示或处理诊断，再决定是否使用部分编译结果。

<a id="feature-interactiveDoc-types"></a>
### 类型

#### InteractiveValue

交互式文档本地 data 可以安全保存的递归值。

```ts
type InteractiveValue =
  | string
  | number
  | boolean
  | null
  | InteractiveValue[]
  | { [key: string]: InteractiveValue };
```

#### InteractiveDocumentCompileResult

一次交互式文档编译的完整结果。

```ts
interface InteractiveDocumentCompileResult {
  messages: ModelMessage[];
  markdown: string;
  data: Record<string, InteractiveValue>;
  errors: InteractiveDocumentCompileError[];
  dependencies: string[];
}
```

#### InteractiveDocumentCompileError

指向源文档问题的结构化诊断。

```ts
interface InteractiveDocumentCompileError {
  sourceId: string;
  message: string;
}
```

<a id="feature-interactiveDoc-api"></a>
### API 定义

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部交互式文档权限 |
| `compile` | 编译文档 |

#### 编译文档

权限标识：`compile`

##### `interactiveDoc.compile(source: string): InteractiveDocumentCompileResult`

解析 prompt_template、本地 sub_data 与显式引用并返回编译结果。

**示例：**

```js
interactiveDoc.compile(source)
```

<a id="feature-preset"></a>
## 预设流程

API 对象：`environment.preset`

执行一段预设 JavaScript。通常应由正常会话启动序列调用，而不是自行创建生成环境。

在受控 Sandbox 中运行一段预设源码，并把调用方提供的 environment 作为局部环境。适合复用已经保存的确定性脚本。

<a id="feature-preset-notes"></a>
### 使用说明

- environment 只影响本次执行，不会自动写回预设或应用状态。
- 需要 Feature 操作时仍必须通过 environment 中已授权的 capability 对象。

<a id="feature-preset-types"></a>
### 类型

#### PresetEnvironment

注入到预设源码的键值环境。

```ts
type PresetEnvironment = Record<string, unknown>;
```

<a id="feature-preset-api"></a>
### API 定义

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部预设流程权限 |
| `execute` | 执行预设流程 |

#### 执行预设流程

权限标识：`execute`

##### `preset.execute(source: string, environment?: Record<string, unknown>): Promise<unknown>`

在给定环境中执行预设源码。

**示例：**

```js
await preset.execute(source, { prompt })
```

<a id="feature-sandbox"></a>
## 代码执行

API 对象：`environment.sandbox`

执行局部 JavaScript 辅助逻辑。Feature 操作仍受各自权限对象限制。

执行短小 JavaScript 表达式或语句，用于数据转换、条件判断和组合已授权 Feature API。它是应用级权限边界，不是操作系统安全沙箱。

<a id="feature-sandbox-notes"></a>
### 使用说明

- values 中的键会作为本次代码执行的局部变量，并优先于普通全局对象。
- 浏览器高风险全局对象由独立 globals 权限控制。

<a id="feature-sandbox-types"></a>
### 类型

#### SandboxValues

一次执行显式注入的局部变量。

```ts
type SandboxValues = Record<string, unknown>;
```

<a id="feature-sandbox-api"></a>
### API 定义

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部代码执行权限 |
| `execute` | 执行 JavaScript |

#### 执行 JavaScript

权限标识：`execute`

##### `sandbox.execute(code: string, values?: Record<string, unknown>): Promise<unknown>`

使用可选局部变量执行 JavaScript。

**示例：**

```js
await sandbox.execute('items.map(x => x.id)', { items })
```

<a id="feature-globals"></a>
## 全局对象

API 对象：`environment.globals`

控制 Sandbox JavaScript 对浏览器全局对象的直接访问。未授权对象仍提供可识别的 Proxy 占位，并在读取、调用或写入时抛出权限错误。

把具有网络、持久化、页面控制、跨上下文或动态代码生成能力的浏览器对象划分为独立授权组。普通语言内建、计时器和编码工具不需要这些权限。

<a id="feature-globals-notes"></a>
### 使用说明

- window、self 与 globalThis 只暴露同一份过滤后的对象视图。
- 未授权对象会在访问时抛出明确权限错误，但这不等同于隔离同一 JavaScript Realm 中的恶意代码。

<a id="feature-globals-types"></a>
### 类型

#### ControlledGlobalGroup

高风险浏览器全局对象的权限分组。

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

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部全局对象权限 |
| `network` | 主动网络访问（fetch、WebSocket、XHR、媒体加载） |
| `storage` | 浏览器存储（localStorage、IndexedDB、Cache） |
| `page` | 页面、导航与浏览器状态（document、location、navigator） |
| `workers` | Worker 与跨上下文消息通道 |
| `codeGeneration` | 动态代码生成（eval、Function） |

#### 主动网络访问（fetch、WebSocket、XHR、媒体加载）

权限标识：`network`

##### `globals.fetch(input, init?): Promise<Response>`

访问浏览器网络请求相关全局对象；也可直接使用 fetch、WebSocket 或 XMLHttpRequest。

#### 浏览器存储（localStorage、IndexedDB、Cache）

权限标识：`storage`

##### `globals.localStorage: Storage`

访问浏览器存储相关全局对象。

#### 页面、导航与浏览器状态（document、location、navigator）

权限标识：`page`

##### `globals.document: Document`

访问页面、地址、导航器、父窗口和打开窗口等广泛的浏览器能力。

#### Worker 与跨上下文消息通道

权限标识：`workers`

##### `globals.Worker: typeof Worker`

创建 Worker 或跨上下文消息通道。

#### 动态代码生成（eval、Function）

权限标识：`codeGeneration`

##### `globals.Function: FunctionConstructor`

允许通过 eval 或 Function 动态编译代码。

<a id="feature-setting"></a>
## 设置目录

API 对象：`environment.setting`

查询 Pulsar 已注册的设置分组与页面。

读取设置导航的注册信息，适合发现可打开页面或生成帮助说明。它不会返回任何设置值、模型密钥或其他 Secret。

<a id="feature-setting-notes"></a>
### 使用说明

- groups 决定设置导航分区，pages 保存标题、说明、图标和所属分组等元数据。
- 需要读取具体配置时应使用该配置所属 Feature 的公开 API。

<a id="feature-setting-types"></a>
### 类型

#### SettingGroupMeta

设置导航中的一个分组。

```ts
interface SettingGroupMeta {
  id: string;
  title: string;
}
```

#### SettingPageMeta

设置页面的导航元数据。icon 是已注册 Vue 组件。

```ts
interface SettingPageMeta {
  id: string;
  icon: Component;
  title: string;
  group: string;
}
```

#### SettingDirectory

设置注册表的公开只读形状。

```ts
interface SettingDirectory {
  groups: SettingGroupMeta[];
  pages: SettingPageMeta[];
}
```

<a id="feature-setting-api"></a>
### API 定义

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部设置目录权限 |
| `read` | 读取设置目录 |

#### 读取设置目录

权限标识：`read`

##### `setting.list(): SettingDirectory`

列出设置分组与页面的元数据，不返回配置值或密钥。

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

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部统计权限 |
| `read` | 读取统计 |

#### 读取统计

权限标识：`read`

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

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部子窗口权限 |
| `open` | 打开子窗口 |

#### 打开子窗口

权限标识：`open`

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

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部翻译权限 |
| `translate` | 翻译文本 |
| `readConfig` | 读取翻译语言配置 |

#### 翻译文本

权限标识：`translate`

##### `translate.text(value: string): Promise<string>`

使用当前提供商与语言设置翻译文本。

**示例：**

```js
await translate.text('Hello')
```

#### 读取翻译语言配置

权限标识：`readConfig`

##### `translate.getConfig(): { sourceLanguage: string; targetLanguage: string; provider: string }`

读取不含密钥的当前翻译配置。

**示例：**

```js
translate.getConfig()
```

<a id="feature-ui"></a>
## 界面

API 对象：`environment.ui`

打开设置或工作区资源，并控制主界面的侧栏。

提供应用壳层的可见交互入口，包括设置、资源标签、侧栏、顶栏标签状态和输入框工具栏布局。领域操作仍由对应 Feature 自己负责。

<a id="feature-ui-notes"></a>
### 使用说明

- openResource 只负责打开标签，不负责创建或验证资源内容。
- 工具栏布局中的每个已知工具只保留一次，缺失工具会按默认分区补回。

<a id="feature-ui-types"></a>
### 类型

#### ComposerToolId

当前输入框工具栏目录中的工具标识。

```ts
type ComposerToolId =
  | "model"
  | "reasoning"
  | "attachment"
  | "whiteboard"
  | "map"
  | "fullscreen";
```

#### TopBarStatus

资源标签可以显示的短期状态。

```ts
interface TopBarStatus {
  kind: "loading" | "success" | "warning" | "error";
  label?: string;
}
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

#### 权限

| 权限标识 | 说明 |
| --- | --- |
| `all` | 全部界面权限 |
| `settings` | 打开或关闭设置 |
| `resources` | 打开工作区资源 |
| `layout` | 控制侧栏布局 |
| `topBarStatus` | 改变顶栏标签状态 |
| `composerToolbar` | 配置会话输入框工具栏 |

#### 打开或关闭设置

权限标识：`settings`

##### `ui.setSettingsOpen(open: boolean): void`

打开或关闭设置窗口。

**示例：**

```js
ui.setSettingsOpen(true)
```

#### 打开工作区资源

权限标识：`resources`

##### `ui.openResource(input: { type: string; id: string; title: string; packageId?: string }): void`

在主工作区打开资源标签。

**示例：**

```js
ui.openResource({ type: 'plugin', id: pluginId, title: '插件' })
```

#### 控制侧栏布局

权限标识：`layout`

##### `ui.setSidebars(input: { left?: boolean; right?: boolean }): void`

显式设置左右侧栏是否打开。

**示例：**

```js
ui.setSidebars({ right: true })
```

#### 改变顶栏标签状态

权限标识：`topBarStatus`

##### `ui.setTopBarStatus(tabId: string, status?: { kind: 'loading' | 'success' | 'warning' | 'error'; label?: string }): void`

设置或清除指定顶栏标签的状态。loading 状态会显示旋转指示器。

**示例：**

```js
ui.setTopBarStatus('conversation:id', { kind: 'loading', label: '生成中' })
```

#### 配置会话输入框工具栏

权限标识：`composerToolbar`

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
ui.setComposerToolbar({ left: ['model', 'attachment'], right: ['map', 'fullscreen'], unused: ['whiteboard'] })
```
