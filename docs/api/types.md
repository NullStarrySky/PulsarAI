# 类型契约

权限系统的公开基础类型位于 `src/features/Capabilities/domain/capability.ts`。以下代码由 VitePress 直接引用源码，不维护副本。



## Sandbox 位置

公开 Feature API 默认注入 Sandbox，并同时提供两个等价入口：

```ts
environment.conversation
environment.misc

environment.capabilities.conversation
environment.capabilities.misc
```

只有被明确归类为破坏性、具有外部副作用、付费或可执行任意代码的方法会被阻止。被阻止的方法不会出现在运行时对象中；可通过 `read_docs(featureId?, apiName?)` 查询 Feature 目录、完整定义以及每个方法的当前可用状态。
