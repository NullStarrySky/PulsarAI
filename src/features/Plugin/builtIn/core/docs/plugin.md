# Plugin 资源

World 是当前 Agent 的文件、上下文和可调用能力来源。根 `/config.json` 管理共享插槽与禁用路径，本地资源位于 `/self/`，全局和内置挂载位于 `/global/<pluginId>/`。资源源码中的 `@/path` 始终指向其所属 Plugin 根，并会按来源挂载规范化。

## 读取和导入

- `read(path)` 同步返回文件原始内容：文本资源为字符串，非文本资源为 `ArrayBuffer`。
- `imports(pathOrPaths, environment?)` 导入并包装一个或一组资源。它只处理各资源自身，不负责递归展开返回内容。
- `parse(pathOrPaths, environment?)` 导入选中资源后递归解析其宏；文本返回字符串，`.chat.json` 返回纯 `message[]`。它处理循环、轮次和日志，并且是异步的，因为宏内 JavaScript 可以产生 Promise。
- `slot.paths(id, scope?)` 同步返回插槽选中资源的显式路径数组；聊天上下文由选中的 `CTX_BUILD` 脚本构建。
- `.data.json` 只保存隔离、初始值与 facade。它们放进 `DATA_INJECT` 后由生成流程读取；给模型的数据说明使用独立 `.chat.json`，放进只供上下文构建读取的 `data_prompt`。
- 从多个挂载的容器取得资源时，每份文本里的 `@/` 已按其文件来源规范化，不会错误指向生成入口所在挂载。

## 文件操作

`fs.readMeta`、`ls`、`exists`、`write`、`edit`、`mkdir`、`move`、`remove` 操作当前 World。写入 `/config.json` 或调用 `select(containerId, paths)` 修改共享契约与禁用路径；Plugin 挂载可以作为一个文件夹路径整体禁用。生成中的修改只在当前 Conversation 的消息路径上生效，并以整个 `codeAct` 为事务提交或回滚。

`open(path)`、`close(path)`、`toggle(path)` 打开、关闭或切换统一资产面板及资源编辑器。

不要直接修改返回对象来假装写入；使用文件 API。不要自行递归实现 import，也不要把 `imports` 当作 Sandbox 递归解析器。
