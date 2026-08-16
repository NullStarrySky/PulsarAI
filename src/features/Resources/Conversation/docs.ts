import type { FeatureDocs } from "@/features/Capabilities/types";

export const docs: FeatureDocs = {
  id: "conversation",
  title: "对话",
  description: "查询角色包和对话，创建对话，或向当前对话发送普通消息、错误提示与统一的容器请求。",
  api: [
    {
      name: "listPackages",
      signature: "listPackages(): Array<{ id, name, nickname?, description, categoryId }>",
      description: "列出角色包的 id、名称、来源 nickname 与说明。",
      example: "conversation.listPackages()",
    },
    {
      name: "listConversations",
      signature: "listConversations(packageId?: string): ConversationSummary[]",
      description: "列出指定角色包或当前角色包中的对话。",
      example: "conversation.listConversations()",
    },
    {
      name: "create",
      signature: "create(input?: { packageId?: string; kind?: 'chat' | 'test'; binding?: ConversationResourceBinding }): Promise<ConversationSummary>",
      description: "在指定角色包或当前角色包中新建并打开普通或测试对话；测试对话可显式绑定资源。",
      example: "await conversation.create({ kind: 'test', binding: { resourceType: 'plugin', resourceId: pluginId } })",
    },
    {
      name: "send",
      signature: "send(content: string): Promise<void>",
      description: "向当前对话发送文本，并运行正常的插件与 Agent 生成流程。",
      example: "await conversation.send('继续')",
    },
    {
      name: "pushErrorMessage",
      signature: "pushErrorMessage(content: string): Promise<void>",
      description: "向当前对话追加一条不会进入后续生成上下文的错误消息。",
      example: "await conversation.pushErrorMessage('读取资源失败')",
    },
    {
      name: "requestContainer",
      signature: "requestContainer(input: { mode: 'generate' | 'command' | 'regenerate' | 'continue' | 'rewrite'; containerId?: string; previousContainerId?: string; action?: ActionPart; prompt?: string }): Promise<{ id, role, command? } | null>",
      description: "统一请求生成容器或既有普通消息操作：generate 新建普通容器；command 新建并执行隐藏命令容器；regenerate 在既有普通助手容器中新建且切换版本；continue、rewrite 在既有当前版本上执行且不切换。命令容器不能用于 regenerate、continue、rewrite，也不能切换消息版本。",
      example: "await conversation.requestContainer({ mode: 'command', action, prompt: '继续推进' })",
    },
  ],
};
