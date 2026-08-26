# Conversation 会话

当前执行环境绑定到一个明确的 Conversation：

- `conversationId` 是稳定会话 ID，`conversation` 是会话记录的只读快照。
- `activePath` 是当前分支上实际选中的消息容器路径；`chat` 与 `CHAT` 是由这条路径编译出的模型消息。
- 一个消息容器可以有多个版本，只有活动版本参与上下文和 Plugin Overlay。不要把旧版本或旁支当作当前事实。
- `reply` 是本次生成唯一可写的助手消息容器。Agent 包装器负责流式正文、thinking、codeAct 步骤和最终状态；不要直接改写历史消息。
- `input.read()` 同步读取未发送草稿，`await input.write(text)` 与 `await input.edit(find, replace)` 乐观修改并异步持久化草稿，`await input.send()` 才把草稿追加为用户消息。草稿在发送前不属于历史。
- 生成期间的 Plugin 文件修改记录在当前消息版本的 Overlay。失败的 `codeAct` 整体回滚；成功操作及统计随该消息版本持久化。用户在资源编辑器里的修改会成为隐藏的因果消息，并在下一次发送时参与当前路径重放。

面对上下文时，以当前活动路径、较新的用户明确要求和当前资源状态为准。只有当缺少的选择会实质改变结果时才向用户提问。
