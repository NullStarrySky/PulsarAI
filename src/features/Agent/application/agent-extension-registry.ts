import type { ToolSet } from "ai";

export type AgentExtensionSource = "skill" | "mcp";

export interface AgentExtensionToolRegistration {
  source: AgentExtensionSource;
  name: string;
  tool: ToolSet[string];
}

const registrations = new Map<string, AgentExtensionToolRegistration>();

function registrationKey(source: AgentExtensionSource, name: string) {
  return `${source}:${name}`;
}

export function registerAgentExtensionTool(
  source: AgentExtensionSource,
  name: string,
  tool: ToolSet[string],
) {
  registrations.set(registrationKey(source, name), {
    source,
    name,
    tool,
  });

  return () => registrations.delete(registrationKey(source, name));
}

export function getAgentExtensionTools(): ToolSet {
  return Object.fromEntries(
    Array.from(registrations.values(), (registration) => [
      registration.name,
      registration.tool,
    ]),
  );
}

export function getAgentExtensionToolNames(source?: AgentExtensionSource) {
  return Array.from(registrations.values())
    .filter((registration) => !source || registration.source === source)
    .map((registration) => registration.name);
}
