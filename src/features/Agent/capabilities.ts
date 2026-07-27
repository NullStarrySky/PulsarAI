import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { getAgentExtensionToolNames } from "./application/agent-extension-registry";

export const capabilities: CapabilityDefinition = {
  id: "agent",
  title: "Agent",
  description: "查询当前 Agent 已注册的扩展工具。",
  subCaps: {
    all: "全部 Agent 权限",
    readTools: "读取扩展工具",
  },
  api: {
    readTools: [{
      name: "listTools",
      signature: "listTools(source?: 'skill' | 'mcp'): string[]",
      description: "列出全部或指定来源的 Agent 扩展工具名。",
      example: "agent.listTools('mcp')",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("readTools") ? { listTools: getAgentExtensionToolNames } : {}),
}));
