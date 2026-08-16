# 插件开发

完整契约见 [`插件系统.md`](./插件系统.md)，源码落点见 [`docs.md`](./docs.md)。

最小可运行插件只需要：

```text
manifest.json   # runtime/generatePath -> generate.js
generate.js     # 生成流程
```

需要资源索引时再添加 `containers.json`，并在文件元信息中设置唯一的 `insertion.target`。需要上下文模板时使用 `.chat.json`；生成流程通过 `run` 获得 `ctx`，自行读取资源、准备消息、执行处理并调用模型。
