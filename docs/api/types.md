---
title: 核心类型
description: Local Plugin、Conversation、Message 与 World 的持久化类型
---

# 核心类型

## LocalPluginDefinition

```ts
interface LocalPluginDefinition {
  schemaVersion: 1;
  name: string;
  nickname?: string;
  description?: string;
  tags: string[];
  avatar?: string;
  cover?: string;
}
```

本地 Plugin 定义不携带 UI 偏好、插槽配置或资源树。它的本地资源始终位于独立的
`resource_worlds:local:<localPluginId>` 文档。

## Conversation

```ts
interface Conversation {
  id: string;
  localPluginId: string;
  kind: "chat" | "test";
  title: string;
  rootContainerId: string | null;
  lastContainerId: string | null;
  binding?: {
    localPluginId?: string;
    resourceType: string;
    resourceId: string;
    resourcePath?: string;
    resourceTitle?: string;
  };
}
```

Conversation 的 World 改动存放在活跃消息路径的隐藏系统消息 `meta.pulses` 中。

## World

```ts
interface WorldDocument {
  id: "global" | `local:${string}`;
  root: WorldFolderNode;
  createDate: string;
  updateDate: string;
}
```

详见 [World 资源 API](/api/resources)。
