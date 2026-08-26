---
layout: home

hero:
  name: PulsarAI
  text: 用资源、求值与操作构建 Agent
  tagline: 一套统一的 Plugin 文件、Sandbox 环境和 Conversation Overlay，组合提示词、上下文与生成流程。
  actions:
    - theme: brand
      text: 阅读系统设计
      link: /design/overview
    - theme: alt
      text: 查阅 API
      link: /api/

features:
  - title: 设计推导
    details: 从直接聊天、静态宏和消息模板开始，理解动态宏、Plugin、插槽、Overlay 与 CodeAct 为什么逐步出现。
    link: /design/overview
    linkText: 系统设计概览
  - title: 项目思路
    details: 用资源、求值、操作三个原语判断所有权、同步边界、平台边界和新功能是否真的需要存在。
    link: /design/thinking
    linkText: 建立心智模型
  - title: Sandbox API
    details: 查看生成环境中的上下文、宏解析、文件、插槽、草稿、回复、Agent 与 CodeAct 契约。
    link: /api/environment
    linkText: 运行环境
  - title: 跨平台 Host
    details: Renderer 只通过稳定 facade 调用数据库和原生能力；Electron 与移动 Tauri 保持清晰的独占命名空间。
    link: /api/host
    linkText: Host API
---

## 从哪里开始

第一次理解项目，请按以下顺序阅读：

1. [系统设计概览](/design/overview)：了解架构如何从普通聊天逐步推导出来。
2. [项目思路](/design/thinking)：掌握开发时用于判断边界的原则。
3. [API 文档](/api/)：把心智模型映射到当前代码的实际签名。

如果只想编写 Plugin，直接从 [运行环境](/api/environment) 和 [Plugin 资源 API](/api/resources) 开始。参与 Renderer 或原生功能开发时，再阅读 [Host API](/api/host) 与 [核心类型](/api/types)。
