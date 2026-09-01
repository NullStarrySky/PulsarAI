---
title: World 资源 API
description: World 路径、嵌套文件树、资源装配与插槽契约
---

# World 资源 API

World 是唯一的资源模型。持久化为两份同构的嵌套文件树：共享
`resource_worlds:global`，以及每个角色包的 `resource_worlds:package:<packageId>`。
`useWorld` 是唯一的读写入口。

## 路径

```text
/self/notes/today.md
/global/core/default.chat.json
/self/slot/chat
```

- `/self/` 指向角色包的本地 World。
- `/global/` 指向共享 World；其一级文件夹是资源来源。
- `/self/slot/<name>/` 是空插槽契约文件夹，不存放资源。
- 文件通过自己的绝对 `slot` 字段贡献给契约，例如 `/self/slot/chat`。
- 源码中的 `@/` 只表示当前来源根目录；公开 World API 只接受以 `/` 开头的路径。

## 节点

```ts
type FolderNode = {
  id: string;
  type: "folder";
  name: string;
  description?: string;
  icon?: string;
  openIcon?: string;
  treeOrder: number;
  children: Record<string, FolderNode | FileNode>;
};

type FileNode = {
  id: string;
  type: "file";
  name: string;
  description?: string;
  icon?: string;
  content: unknown;
  resourceSelected: boolean;
  slot?: string;
  priority: number;
  condition?: string;
};
```

插槽文件夹额外拥有 `selectionMode` 与 `allowedResourceTypes`。文件夹和文件均以稳定
ID 作为 `children` 键，路径解析时使用显示名称。

## 文件操作

```ts
world.read(path)
world.write(path, content)
world.edit(path, find, replace)
world.mkdir(path)
world.move(from, to)
world.remove(path)
world.updateFile(path, patch)
world.updateFolder(path, patch)
```

基础 World 的操作先把变更写入 SurrealDB，再将相同更新应用到内存文档。会话 World
将同一更新附加到隐藏系统消息；重放时只对克隆的 World 执行这些更新，不改动基础文档。

## 资源装配

`import` 按文件类型包装一个资源，并在需要时执行条件和宏。`slot.paths(path)` 返回某个
契约下按优先级排序、且已选中的资源路径；`single` 契约至多返回一个资源。

`Slots` 与 `Sources` 都是 `useWorld` 从同一棵树导出的视图，不是额外文件或持久化模型。
