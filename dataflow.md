// 如果你是个agent，**不要改这个**，这里的信息要求人工同步来维持对系统行为的掌控力，你可以提出更新建议，但不要直接改。

Database/
  - mock-database.ts
无持久化简单内存数据库，仅用于自动化测试
  - dbsync-store.ts
统一资源（插件，会话元信息，会话内容，角色列表）内存管理store。
load/unload加载资源，markDirty配合scheduler封装内存持久化过程，并实现节流优化
此store是所有资源数据库操作的封装者

Conversation/
  components/
    - Composer.vue
    - Manager.vue
    - Markdown.vue
    - Message.vue
    - Steps.vue
    - Surface.vue
    - Timeline.vue
分别是会话的输入框，会话列表，md渲染器，消息气泡，思考步骤，总容器以及气泡流组件
  dataflow/
    activePathComposable/
      - index.ts
      - interval-services.ts
      - message-service.ts
      - path-projection.ts
    containerComposable/
      - actions.ts
      - attachments.ts
      - branch.ts
      - index.ts
      - intervals.ts
      - message.ts
      - version.ts
    containers.ts
    conversations.ts
    types.ts

Environment/
  pages/
    - about/AboutSettingsPage.vue
    - appearance/
