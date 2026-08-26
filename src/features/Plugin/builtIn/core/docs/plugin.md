# Plugin 资源

Plugin 是当前 Agent 的文件、上下文和可调用能力来源。路径写作 `@pluginId/path`；在某个 Plugin 资源源码中，`@/path` 永远指向该源码所属 Plugin。

## 读取和导入

- `read(path)` 同步返回文件原始内容：文本资源为字符串，非文本资源为 `ArrayBuffer`。
- `imports(pathOrPaths, environment?)` 导入并包装一个或一组资源。它只处理各资源自身，不负责递归展开返回内容。
- `parse(pathOrPaths, environment?)` 导入选中资源后递归解析其宏；文本返回字符串，`.chat.json` 返回纯 `message[]`。它处理循环、轮次和日志，并且是异步的，因为宏内 JavaScript 可以产生 Promise。
- `slot.paths(id, scope?)` 同步返回插槽选中资源的显式路径数组；聊天上下文由选中的 `CTX_BUILD` 脚本构建。
- `.data.json` 只保存隔离、初始值与 facade。它们放进 `DATA_INJECT` 后由生成流程读取；给模型的数据说明使用独立 `.chat.json`，放进只供上下文构建读取的 `data_prompt`。
- 从多个 Plugin 的插槽取得资源时，每份文本里的 `@/` 已按其文件来源改写，不会错误指向当前主 Plugin。

## 文件操作

`fs.readMeta`、`ls`、`exists`、`write`、`edit`、`mkdir`、`move`、`remove` 操作当前内存/Overlay 视图。路径和修改调用本身是同步的；持久化在后台进行。生成中的修改只在当前 Conversation 的消息路径上生效，并以整个 `codeAct` 为事务提交或回滚。

`open(path)`、`close(path)`、`toggle(path)` 打开、关闭或切换资源编辑器。传入 `@/` 或 `@pluginId/` 时，它们操作对应的 Plugin 面板。

不要直接修改返回对象来假装写入；使用文件 API。不要自行递归实现 import，也不要把 `imports` 当作 Sandbox 递归解析器。
