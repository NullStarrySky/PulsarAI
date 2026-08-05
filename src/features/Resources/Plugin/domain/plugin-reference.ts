export type PluginContainerScope = "local" | "global";

export interface PluginContainerDeclaration {
  name: string;
  scope: PluginContainerScope;
  description?: string;
}

export interface PluginContainerDefinitions {
  containers: PluginContainerDeclaration[];
  diagnostics: Array<{ path: string; message: string }>;
}

function parseContainerDeclarations(
  value: unknown,
  diagnostics: PluginContainerDefinitions["diagnostics"],
) {
  const containers: PluginContainerDeclaration[] = [];
  if (!Array.isArray(value)) {
    diagnostics.push({ path: "$.containers", message: "containers 必须是数组。" });
    return containers;
  }
  value.forEach((rawContainer, containerIndex) => {
    const path = `$.containers[${containerIndex}]`;
    if (!isRecord(rawContainer)) {
      diagnostics.push({ path, message: "容器声明必须是对象。" });
      return;
    }
    const name = normalizedText(rawContainer.name);
    if (!name) {
      diagnostics.push({ path: `${path}.name`, message: "容器名称不能为空。" });
      return;
    }
    const scope = rawContainer.scope;
    if (scope !== "local" && scope !== "global") {
      diagnostics.push({ path: `${path}.scope`, message: "scope 必须是 local 或 global。" });
      return;
    }
    if (
      rawContainer.description !== undefined
      && typeof rawContainer.description !== "string"
    ) {
      diagnostics.push({ path: `${path}.description`, message: "description 必须是字符串。" });
    }
    const description = normalizedText(rawContainer.description);
    containers.push({
      name,
      scope,
      ...(description ? { description } : {}),
    });
  });
  return containers;
}

export function parsePluginContainerDefinitions(
  source: unknown,
): PluginContainerDefinitions {
  let value = source;
  const diagnostics: PluginContainerDefinitions["diagnostics"] = [];
  if (typeof source === "string") {
    try {
      value = JSON.parse(source);
    } catch (error) {
      return {
        containers: [],
        diagnostics: [{
          path: "$",
          message: error instanceof Error ? error.message : "containers.json 语法错误。",
        }],
      };
    }
  }
  if (!isRecord(value)) {
    return {
      containers: [],
      diagnostics: [{ path: "$", message: "containers.json 根节点必须是对象。" }],
    };
  }
  return {
    containers: parseContainerDeclarations(value.containers, diagnostics),
    diagnostics,
  };
}

export function serializePluginContainerDefinitions(
  definitions: Pick<PluginContainerDefinitions, "containers">,
) {
  return JSON.stringify({ containers: definitions.containers }, null, 2);
}

export function parseContainerReferenceTarget(target: string): {
  scope: PluginContainerScope | "auto";
  name: string;
} {
  const raw = target.trim();
  const normalized = raw.startsWith("container:")
    ? raw
    : `container:auto/${raw}`;
  const match = /^container:(local|global|auto)\/(.+)$/.exec(normalized);
  if (!match) {
    throw new Error(`容器引用格式无效：${normalized}`);
  }
  return {
    scope: match[1] as PluginContainerScope | "auto",
    name: match[2]!.trim(),
  };
}

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
