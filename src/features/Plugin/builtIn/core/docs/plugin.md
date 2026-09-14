# Plugin 资源

World 是当前 Agent 的文件、上下文和可调用能力来源。本地资源位于 `/self/`，共享来源位于 `/global/<source-folder>/`，角色通过 `/self/definition.package.json` 的 `globalPlugins` 文件夹名称数组决定启用哪些共享来源及其合并顺序。每个来源先独立重放属于自己的 Pulse，再进行合并。资源源码中的 `@/path` 始终指向其所属来源根，并会按来源挂载规范化。

## 读取和导入

- `read(path)` 同步返回文件原始字符串。资源树目前只保存文本文件。
- `imports(pathOrPaths)`（也可使用 `fs.import`）同步导入并包装一个或一组资源。JS 返回 `export default` 的值，绝不自动调用；JSON 返回解析后的值。它不负责递归展开返回内容。
- `parse(pathOrPaths, environment?)` 导入选中资源后递归解析其宏；文本返回字符串，`.chat.json` 返回纯 `message[]`。它处理循环、轮次和日志，并且是异步的，因为宏内 JavaScript 可以产生 Promise。
- `slot.paths(id, scope?)` 同步返回插槽选中资源的显式路径数组；聊天上下文由选中的 `CTX_BUILD` 脚本构建。
- 状态保存为普通 JSON；组合式函数保存在 JS 中，封装 `read` / `write`、派生值和动作，例如 `imports("@/counter.js")().increment()`。写入仍通过文件 API 产生可重放的 Pulse，无需把资产注入环境。
- 每次生成的 `importRegistry` 按解析后的绝对路径缓存所有导入结果；同路径返回同一值，模块只求值一次，下一次生成重新加载。`read` 始终读取最新源码；文件写入不会清除此轮导入快照。需要读取最新 JSON 状态时使用 `JSON.parse(read(path))`。
- 模块级闭包随缓存保留；组合式函数每次调用仍创建新实例，需要共享实例时由模块自行保存。导出的函数保留定义资源的来源作用域，内部 `@/` 不随调用方改变。
- JS 必须声明默认导出；可导出函数、类或任意表达式。模块加载同步，不支持顶层 await、静态 import 或具名导出；跨资源使用 `imports`，异步操作放在导出的 async 函数里。生成入口和上下文处理器导出函数，由调用方显式执行并传参。
- 从多个挂载的容器取得资源时，每份文本里的 `@/` 已按其文件来源规范化，不会错误指向生成入口所在挂载。

## 文件操作

`stat(path)` 返回资源路径、名称、类型及元数据快照。`list(path?, { limit? })` 只列出直接子项；`tree(path?, { maxDepth?, limit? })` 返回嵌套资源条目；`find(path?, { name?, kind?, limit? })` 递归查找资源。它们均返回 `{ entries, truncated }`，默认上限为 100。`search(text, path?, { context?, offset?, caseSensitive?, regex?, wholeWord?, maxDepth?, extensions? })` 按行搜索，支持大小写、正则、单词、深度与扩展名过滤，返回带行号和前后文本的 `{ matches, truncated, nextOffset }`；使用 `nextOffset` 翻页。`readLines(path, { startLine?, endLine?, limit? })` 返回有行号的受限文本行。`exists` 仅在路径不存在时返回 `false`，无效路径与未加载 World 会报错。

`write(path, content, { parents?, overwrite? })` 默认创建缺失父目录并覆盖同名文件；`overwrite: false` 仅允许创建。`mkdir(path, { parents?, existOk? })` 默认递归且允许已有目录。`move/copy(from, to, { parents?, overwrite? })` 要求来源和目标没有祖先关系；默认不覆盖目标。`remove(path, { missingOk? })` 删除文件或整个文件夹，`rmdir(path, { missingOk? })` 只删除空文件夹。`append(path, content, { parents? })` 创建或追加文件；`touch(path, { parents? })` 只在文件缺失时创建空文件。`edit(path, find, replace, { all?, expectedMatches? })` 默认只替换第一次匹配；`all` 替换全部，`expectedMatches` 用于确认匹配数量。插槽属性由 `/self/slot/` 下的契约文件夹维护，资源选择直接写入资源节点。生成中的修改只在当前 Conversation 的消息路径上生效；同一次 `codeAct` 的 World 修改会在函数成功返回时一起提交，抛错时回滚。

`open(path)`、`close(path)`、`toggle(path)` 打开、关闭或切换统一资产面板及资源编辑器。

`zip(path?)` 将一个文件或文件夹下的文本资源压缩为可序列化的 ZIP 字节数组。`unzip(bytes, path?, { parents?, overwrite? })` 在目标目录解压 UTF-8 文本文件；它拒绝 ZIP 路径穿越和非文本内容，并且会随 CodeAct 一起提交或回滚。文件元数据和空目录不属于 ZIP 格式内容。

## 网络请求

`await fetch(url, init?)` 通过 Host 的 HTTP(S) 代理请求网络，并返回标准 `Response`。它接受通常的 `method`、`headers` 和 `body`，以及 curl 常用的 `redirect: "follow" | "manual" | "error"` 与 `timeout`（毫秒，1–120000）。HTTP 4xx/5xx 仍返回 Response，使用 `response.ok`、`response.status` 和 `await response.text()` / `json()` / `arrayBuffer()` 判断和读取结果。请求不会注入 Secret；需要模型 Provider Secret 的调用继续使用其专用请求层。

不要直接修改返回对象来假装写入；使用文件 API。不要自行递归实现 import，也不要把 `imports` 当作 Sandbox 递归解析器。
