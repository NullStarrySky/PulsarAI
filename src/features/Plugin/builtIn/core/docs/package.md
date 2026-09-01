# 角色包

角色包是一次长期角色体验的身份与资源边界，不是聊天记录本身。

- `package` 是当前角色包的只读快照，`packageId` 是它的稳定 ID。名称、昵称和图标可能变化，不要用它们代替 ID 建立关系。
- 每个角色包拥有一棵完整 World：本地资源位于 `/self/`，插槽契约位于 `/self/slot/`，共享来源映射到 `/global/<source-folder>/`。
- World config 的 `disabled` 路径决定哪些文件或 Plugin 挂载不参与插槽。`generatePath` 单选插槽使用排序最前的启用入口。
- Conversation 必须属于一个角色包。同一角色包可以有多个普通会话和测试会话，它们共享基础资源，但消息路径及其 Overlay 相互独立。
- 当前 Agent 没有直接修改角色包元数据的 API。需要查看或修改资料时操作 World；需要用户决定生成入口时应当询问用户。
