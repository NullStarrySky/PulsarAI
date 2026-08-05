# Feature API

每个公开 API 的 Feature 都通过统一的 `capabilities.ts` 导出定义、说明与运行时 builder。中央注册表始终把普通公开 API 加入 Sandbox，同时暴露在 `environment.<featureId>` 和 `environment.capabilities.<featureId>`。

## 按需文档

生成上下文只包含简短入口，不再插入完整 API 清单：

- `readDocs()` 返回 Feature 目录；
- `readDocs(featureId)` 返回完整类型、函数说明与可用状态；
- `readDocs(featureId, apiName)` 返回单个函数。

每个函数标记为 `available` 或 `blocked`。被封锁的方法也会从实际运行时对象中移除。

## 同步规则

新增或修改公开 API 时只修改所属 Feature 的定义与 builder：

1. `subCaps` 定义稳定分组和人类说明；
2. `api` 定义签名、返回值与示例；
3. `builder` 创建该 Feature 的公开方法；
4. 中央注册表组装 Sandbox 对象、应用特殊方法策略并实现 `readDocs()`；
5. VitePress 从相同定义生成参考页面。

## 边界

这是应用级策略边界，不是操作系统级安全沙箱。数据库写入/删除、文件删除、任意执行、外部扩展、付费模型调用等特殊方法必须由中央策略实际移出普通运行时，而不是只隐藏说明。
