---
title: 核心类型
description: Package、Conversation、Message 与 World 的持久化类型
---

# 核心类型

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
  conversations: Array<{ id: string; lastContainerid: string; title: string }>;
  syncEnabled?: boolean;
}
```

角色包不携带 Plugin、插槽配置或资源树。它的本地资源始终位于独立的
`resource_worlds:package:<packageId>` 文档。

## Conversation

```ts
interface Conversation {
  id: string;
  packageId: string;
  kind: "chat" | "test";
  title: string;
  rootContainerId: string | null;
  lastContainerId: string | null;
  binding?: {
    packageId?: string;
    resourceType: string;
    resourceId: string;
    resourcePath?: string;
    resourceTitle?: string;
  };
}
```

Conversation 的 World 改动存放在活跃消息路径的隐藏系统消息 `meta.worldUpdates` 中。

## World

```ts
interface WorldDocument {
  id: "global" | `package:${string}`;
  root: WorldFolderNode;
  createDate: string;
  updateDate: string;
}
```

详见 [World 资源 API](/api/resources)。
