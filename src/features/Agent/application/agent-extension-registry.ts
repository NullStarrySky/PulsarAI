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

export function getAgentExtensionToolNames(source?: AgentExtensionSource) {
  return Array.from(registrations.values())
    .filter((registration) => !source || registration.source === source)
    .map((registration) => registration.name);
}

export function listAgentExtensions(source?: AgentExtensionSource) {
  return Array.from(registrations.values())
    .filter((registration) => !source || registration.source === source)
    .map((registration) => ({
      source: registration.source,
      name: registration.name,
      description:
        typeof registration.tool.description === "string"
          ? registration.tool.description
          : undefined,
    }));
}

export async function invokeAgentExtension(
  source: AgentExtensionSource,
  name: string,
  input: unknown,
) {
  const registration = registrations.get(registrationKey(source, name));
  if (!registration) {
    throw new Error(`Agent 扩展不存在：${source}/${name}`);
  }
  const execute = registration.tool.execute as
    | ((
      input: unknown,
      options: {
        toolCallId: string;
        messages: never[];
        context: undefined;
      },
    ) => unknown)
    | undefined;
  if (!execute) {
    throw new Error(`Agent 扩展不能在本地执行：${source}/${name}`);
  }
  const output = await execute(input, {
    toolCallId: crypto.randomUUID(),
    messages: [],
    context: undefined,
  });
  if (isAsyncIterable(output)) {
    const values: unknown[] = [];
    for await (const value of output) values.push(value);
    return values;
  }
  return output;
}

export function createAgentExtensionApi(source: AgentExtensionSource) {
  return {
    list: () => listAgentExtensions(source),
    call: (name: string, input: unknown) =>
      invokeAgentExtension(source, name, input),
  };
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(
    value
    && typeof value === "object"
    && Symbol.asyncIterator in value,
  );
}
