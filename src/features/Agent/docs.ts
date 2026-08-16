import type { FeatureDocs } from "@/features/Capabilities/types";

export const docs: FeatureDocs = {
  id: "agent",
  title: "Agent",
  description: "在 CodeAct 上下文中查询并调用 Agent 扩展、询问用户及提示建议卡片。",
  documentation: {
    overview: "ToolLoopAgent 只向模型暴露一个 codeAct 工具。Skill 与 MCP 扩展保留在 Agent 注册表中，并通过这里的普通上下文函数由 codeAct 调用。`agent.askUser` 和 `agent.askSuggestion` 可直接触发卡片组件并等待用户交互。",
    notes: [
      "扩展不再作为独立模型工具出现，因此不会扩大模型工具列表。",
      "省略 source 时会合并全部已注册扩展来源。",
      "callExtension 只调用已经注册且提供本地 execute 实现的扩展。",
      "askUser 支持单问题与 Approval Card 多问题排版。",
      "askSuggestion 用于展示 Recommendation Card 推荐与备选方案。",
    ],
    types: [
      {
        name: "AgentExtensionSource",
        description: "当前支持的 Agent 扩展来源。",
        definition: `type AgentExtensionSource = "skill" | "mcp";`,
      },
      {
        name: "AgentExtensionSummary",
        description: "可供 CodeAct 调用的扩展摘要。",
        definition: `type AgentExtensionSummary = {
  source: AgentExtensionSource;
  name: string;
  description?: string;
};`,
      },
    ],
  },
  api: [
    {
      name: "listTools",
      signature: "listTools(source?: AgentExtensionSource): string[]",
      description: "兼容接口：列出全部或指定来源的 Agent 扩展名称。",
      example: "agent.listTools('mcp')",
    },
    {
      name: "listExtensions",
      signature: "listExtensions(source?: AgentExtensionSource): AgentExtensionSummary[]",
      description: "列出可在 CodeAct 上下文中调用的扩展及其说明。",
      example: "agent.listExtensions('skill')",
    },
    {
      name: "callExtension",
      signature: "callExtension(source: AgentExtensionSource, name: string, input: unknown): Promise<unknown>",
      description: "调用一个已注册扩展，并把返回值或错误交给当前 CodeAct 函数。",
      example: "await agent.callExtension('mcp', 'search', { query: 'PulsarAI' })",
    },
    {
      name: "askUser",
      signature: "askUser(input: AskUserInput): Promise<AskUserResult>",
      description: "在 Approval Card 中弹出单问题或多问题表单并等待用户选择与输入。",
      example: "await agent.askUser({ questions: [{ question: '发布多少种口味？', options: ['3种', '5种'] }] })",
    },
    {
      name: "askSuggestion",
      signature: "askSuggestion(input: AskSuggestionInput): Promise<AskSuggestionResult>",
      description: "在 Recommendation Card 中展示推荐方案与 Alternatives 抽屉并等待用户确认。",
      example: "await agent.askSuggestion({ title: '确认补货订单？', options: [{ key: '1', short: '方案A', body: '详情...', signal: 3, label: '高置信度', cta: '接受' }] })",
    },
  ],
};
