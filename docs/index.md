---
layout: home

hero:
  name: PulsarAI
  text: Feature API 文档
  tagline: 与权限定义和模型提示词共用同一份事实来源
  actions:
    - theme: brand
      text: 查看 Feature API
      link: /api/
    - theme: alt
      text: 理解权限系统
      link: /guide/capabilities

features:
  - title: 单一事实来源
    details: 权限说明、API 类型、Sandbox 对象和模型提示词都从各 Feature 的 capabilities.ts 构建。
  - title: 角色包隔离
    details: 默认权限可在设置中管理，每个角色包可以按 Feature 覆盖子权限。
  - title: 面向代码生成
    details: 模型只接收当前授权 API 的签名、说明与示例，并通过内置代码执行工具调用。
---
