import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import {
  getAgentExtensionToolNames,
  invokeAgentExtension,
  listAgentExtensions,
} from "./application/agent-extension-registry";

export const capabilities: CapabilityDefinition = {
  id: "agent",
  title: "Agent",
  description: "在 CodeAct 上下文中查询并调用 Agent 扩展。",
  documentation: {
    overview: "ToolLoopAgent 只向模型暴露一个 codeAct 工具。Skill 与 MCP 扩展保留在 Agent 注册表中，并通过这里的普通上下文函数由 codeAct 调用。",
    notes: [
      "扩展不再作为独立模型工具出现，因此不会扩大模型工具列表。",
      "省略 source 时会合并全部已注册扩展来源。",
      "callExtension 只调用已经注册且提供本地 execute 实现的扩展。",
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
  subCaps: {
    all: "全部 Agent 权限",
    readTools: "读取并调用 Agent 扩展",
  },
  api: {
    readTools: [
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
    ],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("readTools")
    ? {
        listTools: getAgentExtensionToolNames,
        listExtensions: listAgentExtensions,
        callExtension: invokeAgentExtension,
      }
    : {}),
}));
