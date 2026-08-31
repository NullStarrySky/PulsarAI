---
title: Plugin 资源 API
description: Plugin 路径、文件操作、import、插槽和约定资源格式
---

# Plugin 资源 API

Plugin 是数据库支持的扁平文件集合。对外文件 API 运行在 World 或 Conversation Overlay 上。

## 路径

```text
/self/notes/today.md
/global/builtin-core-plugin/default.chat.json
```

- `/` 是 World 根，固定包含 `/config.json`、`/self/` 和 `/global/`；`/self/` 是角色包本地挂载，`/global/<pluginId>/` 是全局或内置挂载。
- `/config.json` 是 World 控制清单，只包含共享插槽定义和禁用 World 路径；禁用状态不改变文件的挂载与直接读取能力。
- Plugin 源码中的 `@/` 始终解析到该源码所属 Plugin 的根；对外 World API 不使用 `@pluginId/`。
- 不带前缀的路径只在 Plugin 内部 API 中按当前 Plugin 解析。
- 文件 API 支持省略扩展名，但只有恰好一个文件匹配时成功；多个候选会抛错。
- `move` 可在同一 World 的挂载之间移动资源。

文本文件被 read/import 时，其中的 `@/` 会改写为该文件所属 World 挂载的绝对路径。这是源码作用域，而不是调用者作用域。

## 元数据

```ts
interface ResourceMeta {
  id: string;
  name: string;
  path: string; // 返回值以 / 开头
  kind: "file" | "folder";
  order?: number;
  insertion?: {
    slot: string;
    condition?: string;
    conditionPath?: string;
  };
}
```

`fs.readMeta(path)` 返回单个资源元数据；`ls(path)` 返回目录的直接子节点。`ls("/")` 返回 `config.json`、`self` 与 `global`。

## 文件操作

```ts
read(path: string): string | ArrayBuffer
write(path: string, content: string | ArrayBuffer): void
edit(path: string, find: string, replace: string): void
ls(path = "/"): ResourceMeta[]
exists(path: string): boolean
mkdir(path: string): void
move(from: string, to: string): void
remove(path: string): void
```

- `read`：文本返回字符串，非文本返回独立 `ArrayBuffer`；不检查条件，也不包装类型。
- `write`：文件存在时替换，不存在时创建；写入 `/config.json` 会校验并更新 World config，不能写 Plugin 根。
- `edit`：只支持文本，只替换第一次匹配；找不到文本时抛错。
- `ls`：列出直接子节点；目录层级由文件和空目录路径推断。
- `exists`：任何解析错误都返回 `false`。
- `mkdir`：创建叶级空目录；Plugin 根为空操作，已存在路径会抛错。
- `move`：可在同一 World 内跨挂载移动，目标文件名由目标路径决定。
- `remove`：删除文件或目录树；不能删除 Plugin 根。

生成环境中的写操作同步修改 Overlay；普通 UI 环境乐观修改 Plugin Store，并在后台持久化。

## import

```ts
imports(path: string | string[], environment?: object): unknown | Promise<unknown>
fs.import(path: string | string[], environment?: object): unknown | Promise<unknown>
fs.run // fs.import 的别名
```

import 先执行资源的 `conditionPath` 与内联 `condition`，再包装恰好一个资源。数组输入保持顺序并扁平化一层；只要其中一个结果是 Promise，整体返回 Promise。

| 文件类型 | 识别方式 | import 结果 |
| --- | --- | --- |
| Markdown | `.md`, `.markdown` | 原始文本 |
| Chat | `.chat.json` | 启用的消息数组 |
| Data | `.data.json` | 只读初始值或 wrapper facade |
| JavaScript | `.js`, `.mjs`, `.cjs`, `.ts` | 在传入环境中异步执行的结果 |
| JSON | 其它 `.json` | 解析后的对象；失败时返回原文本 |
| Media | 图片、视频等后缀 | `ArrayBuffer` |
| Component | `.vue`, `.jsx`, `.tsx` | 当前按文本包装 |
| Text | 其它后缀 | 文本 |

import 不递归解析返回文本中的宏。使用 `parse()` 完成递归。

## 插入条件

```ts
interface PluginFileInsertion {
  slot: string;
  condition?: string;
  conditionPath?: string;
}
```

`conditionPath` 相对声明资源解析，必须指向同步 JavaScript 文本；随后才执行内联 `condition`。两者在同一条件环境中求值并转换为 boolean。条件不通过时 import 返回 `null`，但仍写入条件日志。

## slots.json

```ts
interface PluginSlot {
  id: string;
  title: string;
  description: string;
  contentSuffixes: string[];
  selectionMode: "single" | "multiple" | "none";
}

interface PluginSlotDefinitions {
  slots: PluginSlot[];
}
```

`contentSuffixes` 不含点号；`*` 接受任何文件，`media` 接受媒体类型。插槽资源按文件 `order` 升序，再按 Plugin ID、资源 ID 稳定排序。

```ts
interface SlotResource {
  id: string;
  pluginId: string;
  pluginName: string;
  name: string;
  type: string;
  path: string;
  order: number;
  condition?: string;
  conditionPath?: string;
}
```

`slot.paths()` 把启用的资源转换为显式路径。当前 `slot.import()` 是同名别名，也返回路径，不包装内容。

根 `/config.json.slots` 与 Plugin `slots.json.slots` 使用同一结构。前者定义全局契约，后者只定义来源本地的插槽；没有父级或子插槽语义。资源通过自己的 `insertion.slot` 直接导出到相应插槽。`/config.json.disabled` 保存禁用的完整文件路径或 `/self`、`/global/<pluginId>` Plugin 挂载路径；`single` 插槽只返回排序最前的启用资源，`multiple` 与 `none` 返回全部启用资源。

## .chat.json

```ts
interface PluginChatContext {
  message: Array<{
    role: "system" | "user" | "assistant";
    content: string;
    name?: string;
    enabled?: boolean;
  }>;
}
```

`name` 是编辑标签。`enabled: false` 的消息保留在文件中，但 import 时排除。

## .data.json

```ts
interface PluginDataDefinition {
  version: 1;
  isolation: "resource" | "conversation";
  initialValue: JsonValue;
  enableUpdater: boolean;
  wrapperSource: string;
  varName?: string;
}
```

没有 wrapper 时 import 直接返回初始 JSON 值。存在 wrapper 时，系统调用 wrapper 函数，传入当前值和控制对象：

```ts
{
  get value(): JsonValue;
  replace(next: JsonValue): void;
}
```

普通资源 import 创建只读 facade；只读上下文调用 `replace` 会抛错。运行值必须始终是纯 JSON。

## config.json

```ts
type PluginConfig = Record<string, {
  renderer: PluginConfigRenderer;
  value: JsonValue;
}>;
```

当前主生成模型固定使用 `generation/model`。背景资源与选择属于 `background` 插槽，不写入 config。

## 约定资源

| 路径/插槽 | 作用 |
| --- | --- |
| `config.json` | Plugin 配置值与编辑器元数据 |
| `slots.json` | 插槽声明 |
| `generatePath` | 主生成入口 JavaScript，单选 |
| `chat` | 聊天上下文入口 `.chat.json` |
| `REGEX` | 有序正则资源；生成流程决定是否执行 |
| `DATA_INJECT` | 仅供生成流程读取的 `.data.json` |
| `data_prompt` | 仅供上下文构建读取的数据说明 `.chat.json` |
| `COMMAND` | 输入框命令或动作资源 |
| `background/` + `background` | 背景媒体候选；选择语义归插槽系统 |
| `tools/<name>/tool.js` | 自定义 Sandbox 函数 |
| `tools/<name>/prompt.md` | 对应工具说明 |
| `temp/` | 临时组件与生成产物 |
| `cache/` | 可再生缓存资源 |
| `skill/` | Skill 资源 |

## UI 操作

`open`、`close`、`toggle` 只接受 Plugin 根或文件，不接受目录。打开文件时使用当前 Conversation 的 Overlay 视图，用户看到的是当前会话最终状态，而不是原始基础 Plugin。
