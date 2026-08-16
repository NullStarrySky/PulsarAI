# Feature API

每个公开 API 的 Feature 都在自己的根 `docs.ts` 中声明 `FeatureDocs` 元数据（id、标题、描述、人类文档与扁平 `api` 清单）。中央注册表把每个 Feature 的运行时对象完整加入 Sandbox，同时暴露在 `environment.<featureId>` 和 `environment.capabilities.<featureId>`；不存在按子权限授权的机制。

## 按需文档

生成上下文只包含简短入口，不再插入完整 API 清单：

- `read_docs()` 返回 Feature 目录；
- `read_docs(featureId)` 返回完整 Feature 定义、类型、函数说明与可用状态；
- `read_docs(featureId, apiName)` 返回单个函数契约；找不到目标时返回 `null`。

每个函数标记为 `available` 或 `blocked`。被封锁的方法也会从实际运行时对象中移除。

## 同步规则

新增或修改公开 API 时：

1. 在所属 Feature 的 `docs.ts` 中补充 `api` 条目（签名、返回值、示例）与人类文档；
2. 在 `src/features/Capabilities/registry.ts` 的工厂表中接线（或完善 Feature 自己的工厂函数）；
3. 需要屏蔽的危险方法加入 `registry.ts` 的中央屏蔽表；
4. `read_docs()` 与 VitePress 参考页从相同定义自动生成。

`docs.ts` 必须保持纯元数据（不引入运行时依赖），脚本与文档站才能无副作用加载。

## 边界

这是应用级策略边界，不是操作系统级安全沙箱。数据库写入/删除、文件删除、任意执行、外部扩展、付费模型调用等特殊方法必须由中央屏蔽表实际移出普通运行时，而不是只隐藏说明。
