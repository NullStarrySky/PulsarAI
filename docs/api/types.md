---
title: 核心类型
description: Package、Conversation、消息、Plugin 和 Overlay 的当前持久化契约
---

# 核心类型

本页列出理解 API 所需的主要领域类型。为便于阅读，省略了部分展示字段注释；精确来源位于 `src/features/*/*-types.ts` 与 `host/contracts.ts`。

## CharacterPackage

```ts
interface CharacterPackage {
  id: string;
  name: string;
  nickname?: string;
  icon: string;
  description?: string;
  categoryId?: string | null;
  order: number;
  pinned?: boolean;
  conversations: Array<{
    id: string;
    lastContainerid: string;
    title: string;
  }>;
  pluginId: string;
  mainPluginId: string;
  enabledGlobalPluginIds: string[];
  syncEnabled?: boolean;
}

interface PackageCategory {
  id: string;
  name: string;
  order: number;
}
```

`pluginId` 是角色本地资源 Plugin；`mainPluginId` 决定生成入口和模型覆盖；`enabledGlobalPluginIds` 决定额外全局 Plugin。关系使用稳定 ID，不能依赖 name/nickname。

## Conversation

```ts
type ConversationKind = "chat" | "test";
type ConversationRendererId = "chat" | "novel";

interface ConversationResourceBinding {
  packageId?: string;
  resourceType: string;
  resourceId: string;
  resourcePath?: string;
  resourceTitle?: string;
  pluginId?: string;
}

interface Conversation {
  id: string;
  packageId: string;
  kind: ConversationKind;
  binding?: ConversationResourceBinding;
  title: string;
  pinned?: boolean;
  isTemplate?: boolean;
  isEphemeral?: boolean;
  rendererId?: ConversationRendererId;
  rootContainerId: string | null;
  lastContainerId: string | null;
  createdAt: string;
  updatedAt: string;
  composerDraft?: string;
}
```

模型与 thinking level 不属于 Conversation。`composerDraft` 在 `input.send()` 前不进入消息历史。

## 消息容器与版本

```ts
type Role = "assistant" | "user" | "system";
type ChatMessageType = "message" | "error";

interface ChatMessageContainer {
  id: string;
  role: Role;
  conversationid: string;
  content: ChatMessage[];
  activeMessage: number | null;
  availableNextContainer: string[];
  activeNextContainer: string | null;
  previousContainer: string | null;
  hidden?: boolean;
  command?: { name: string; args: string };
  draft?: string;
}

interface ChatMessage {
  id: string;
  type: ChatMessageType;
  content: string;
  createdAt: string;
  favorite?: boolean;
  meta: ChatMessageMeta;
  parts?: AdditionalParts[];
}
```

容器负责树和角色，一个容器内的 `content` 是多个重生成版本；`activeMessage` 选择当前版本。隐藏容器保留因果关系，但不进入普通模型消息。

## 消息 parts 与 steps

```ts
type AdditionalParts =
  | { type: "text"; text: string }
  | { type: "image"; image: DataContent | URL; mediaType?: string }
  | {
      type: "file";
      data: DataContent | URL;
      filename?: string;
      mediaType: string;
      size?: number;
    }
  | {
      type: "action";
      actionId: string;
      pluginId: string;
      pluginName: string;
      name: string;
      description: string;
    };

type MessageStep =
  | { type: "thinking"; id: string; message: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      input: unknown;
      output: unknown;
    };
```

只持久化 Agent thinking 和模型工具调用/结果。宏日志属于 `PluginLogger`。

## Plugin

```ts
interface Plugin {
  id: string;
  packageId: string | null;
  name: string;
  icon: string;
  shortDescription: string;
  files: PluginFile[];
  emptyFolders: string[];
  enabled: boolean;
  builtIn: boolean;
}

interface PluginFile {
  id: string;
  path: string;
  name: string;
  icon: string;
  treeOrder: number;
  kind: "file";
  content: unknown;
  order: number;
  insertion?: {
    slot: string;
    condition?: string;
    conditionPath?: string;
  };
}

interface PluginFolder {
  id: string; // folder:<path>
  path: string;
  name: string;
  icon: string;
  treeOrder: number;
  kind: "folder";
}
```

`PluginFolder` 是推断视图，不是持久化资源。文件的稳定 ID 用于 Overlay 定位；路径可以移动。

## Overlay 操作

```ts
type ConversationResourceOperation =
  | {
      type: "edit";
      target: {
        kind: "plugin-node";
        pluginId: string;
        resourceId: string;
      };
      value: ConversationResourceNodeSnapshot;
    }
  | {
      type: "edit";
      target: {
        kind: "data";
        pluginId: string;
        resourceId: string;
        dataId: string;
        path: string;
      };
      value: unknown;
    }
  | {
      type: "create";
      pluginId: string;
      parentPath: string;
      node: ConversationResourceNodeSnapshot;
    }
  | {
      type: "move";
      pluginId: string;
      resourceId: string;
      targetPluginId: string;
      targetParentPath: string;
      name: string;
    }
  | {
      type: "remove";
      target: {
        kind: "plugin-node";
        pluginId: string;
        resourceId: string;
      };
    };
```

操作绑定到具体 ChatMessage 版本。重放只沿活动容器路径，并且每个容器只读取活动消息版本。

## 操作统计

```ts
interface ConversationResourceOperationStats {
  total: number;
  edit: number;
  create: number;
  move: number;
  remove: number;
  codeAct: {
    attempted: number;
    committed: number;
    rolledBack: number;
  };
  logCount: number;
}
```

`ChatMessageMeta.resourceUpdate` 同时保存有序操作、创建时间和最终统计。

## JSON 值

Plugin config 与 data 运行值使用递归纯 JSON：

```ts
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
```

不要把 Vue proxy、函数、DOM、Host 对象或类实例写入 Plugin data 与持久化消息元数据。
