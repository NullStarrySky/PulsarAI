# 权限系统

每个可外置 API 的 Feature 都通过统一的 `capabilities.ts` 导出：

```ts
interface CapabilityDefinition {
  id: string
  title: string
  description: string
  subCaps: Record<string, string>
  api: Record<string, CapabilityApiDoc[]>
}

type CapabilityBuilder = (
  subCapIds: string[]
) => [Record<string, unknown>, string]
```

`all` 是便捷权限，会在构建时展开为该 Feature 的全部显式子权限。构造结果中的对象加入 Sandbox 默认基底；提示词作为 system context 插入，同时也可从 `CAPABILITIES_PROMPT` / `API_DOCUMENTATION` 位置读取。

## 配置继承

设置中的“默认权限”是全局基线。角色包未配置权限时完整继承基线；切换为自定义后，角色包按 Feature 保存子权限列表。某个 Feature 的显式空数组表示拒绝该 Feature 的全部 API。

## 同步规则

新增或修改外置 API 时只修改所属 Feature 的权限定义与 builder：

1. `subCaps` 定义授权粒度和人类说明；
2. `api` 定义签名、返回值与示例；
3. `builder` 只组装已授权方法；
4. 中央注册表构建 Sandbox 对象与模型提示词；
5. VitePress 的 `<CapabilityReference />` 直接读取中央定义。

因此，设置 UI、模型上下文与站点参考不会各自维护一份容易漂移的清单。

## 边界

这是 Pulsar Feature API 的应用级权限边界。浏览器前端的动态 JavaScript 并不等价于操作系统级安全沙箱；高风险能力仍应使用细粒度子权限，并避免默认授权数据库写入、删除、备份恢复等操作。
