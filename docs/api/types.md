# 类型契约

权限系统的公开基础类型位于 `src/features/Capabilities/domain/capability.ts`。以下代码由 VitePress 直接引用源码，不维护副本。

<<< ../../src/features/Capabilities/domain/capability.ts

默认权限同样直接引用应用使用的定义：

<<< ../../src/features/Capabilities/domain/default-grants.ts

## Sandbox 位置

若 `conversation.read` 和 `misc.readPlatform` 已授权，运行时会同时提供：

```ts
environment.conversation
environment.misc

environment.capabilities.conversation
environment.capabilities.misc
```

未授权的 Feature 或方法不会出现在对象中。调用前应以当前上下文中生成的 API 文档为准。
