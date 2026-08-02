export type PluginContainerScope = "root" | "plugin" | "global";
export type PluginContainerQueryScope = PluginContainerScope | "depth";

export interface PluginContainerDelivery {
  mode: "eager" | "on_demand";
  extractor?: string;
  transformer?: string;
  index: "members" | "description";
  max_results: number;
}

export interface PluginReferenceToken {
  raw: string;
  target: string;
  start: number;
  end: number;
}

export interface PluginContainerImport {
  alias: string;
  target: string;
}

export interface PluginContainerDeclaration {
  name: string;
  scope: PluginContainerScope;
  description?: string;
  delivery?: PluginContainerDelivery;
  imports: PluginContainerImport[];
}

export interface PluginReferenceSuggestion {
  target: string;
  label: string;
  detail: string;
  description?: string;
}

export interface PluginContainerDefinitions {
  containers: PluginContainerDeclaration[];
  diagnostics: Array<{ path: string; message: string }>;
}

const referencePattern = /<@([^>\r\n]+)>/g;

export function findPluginReferenceTokens(source: string): PluginReferenceToken[] {
  const tokens: PluginReferenceToken[] = [];
  for (const match of source.matchAll(referencePattern)) {
    if (match.index == null) continue;
    const raw = match[0];
    const target = (match[1] ?? "").trim();
    if (!target) continue;
    tokens.push({
      raw,
      target,
      start: match.index,
      end: match.index + raw.length,
    });
  }
  return tokens;
}

export function replacePluginReferenceTokens(
  source: string,
  replace: (token: PluginReferenceToken, index: number) => string,
) {
  const tokens = findPluginReferenceTokens(source);
  if (!tokens.length) return source;
  let cursor = 0;
  let result = "";
  tokens.forEach((token, index) => {
    result += source.slice(cursor, token.start);
    result += replace(token, index);
    cursor = token.end;
  });
  return result + source.slice(cursor);
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
    if (scope !== "root" && scope !== "plugin" && scope !== "global") {
      diagnostics.push({ path: `${path}.scope`, message: "scope 必须是 root、plugin 或 global。" });
      return;
    }
    const imports: PluginContainerImport[] = [];
    if (rawContainer.imports !== undefined && !Array.isArray(rawContainer.imports)) {
      diagnostics.push({ path: `${path}.imports`, message: "imports 必须是数组。" });
    }
    for (const [importIndex, rawImport] of (
      Array.isArray(rawContainer.imports) ? rawContainer.imports : []
    ).entries()) {
      const importPath = `${path}.imports[${importIndex}]`;
      if (!isRecord(rawImport)) {
        diagnostics.push({ path: importPath, message: "容器引用必须是对象。" });
        continue;
      }
      const target = normalizedText(rawImport.target);
      const alias = normalizedText(rawImport.alias);
      if (!alias) {
        diagnostics.push({ path: `${importPath}.alias`, message: "引用别名不能为空。" });
        continue;
      }
      if (!target) {
        diagnostics.push({ path: `${importPath}.target`, message: "引用目标不能为空。" });
        continue;
      }
      imports.push({
        alias,
        target,
      });
    }
    if (
      rawContainer.description !== undefined
      && typeof rawContainer.description !== "string"
    ) {
      diagnostics.push({ path: `${path}.description`, message: "description 必须是字符串。" });
    }
    const description = normalizedText(rawContainer.description);
    const delivery = parseContainerDelivery(
      rawContainer.delivery,
      `${path}.delivery`,
      diagnostics,
    );
    containers.push({
      name,
      scope,
      ...(description ? { description } : {}),
      ...(delivery ? { delivery } : {}),
      imports,
    });
  });
  return containers;
}

function parseContainerDelivery(
  value: unknown,
  path: string,
  diagnostics: PluginContainerDefinitions["diagnostics"],
): PluginContainerDelivery | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    diagnostics.push({ path, message: "delivery 必须是对象。" });
    return undefined;
  }
  const mode = value.mode;
  if (mode !== "eager" && mode !== "on_demand") {
    diagnostics.push({
      path: `${path}.mode`,
      message: "mode 必须是 eager 或 on_demand。",
    });
    return undefined;
  }
  const index = value.index === undefined ? "members" : value.index;
  if (index !== "members" && index !== "description") {
    diagnostics.push({
      path: `${path}.index`,
      message: "index 必须是 members 或 description。",
    });
  }
  const maxResults = value.max_results === undefined
    ? 8
    : Number(value.max_results);
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) {
    diagnostics.push({
      path: `${path}.max_results`,
      message: "max_results 必须是 1 到 100 的整数。",
    });
  }
  for (const key of ["extractor", "transformer"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") {
      diagnostics.push({
        path: `${path}.${key}`,
        message: `${key} 必须是显式资源引用字符串。`,
      });
    }
  }
  const extractor = normalizedText(value.extractor);
  const transformer = normalizedText(value.transformer);
  return {
    mode,
    index: index === "description" ? "description" : "members",
    max_results: Number.isInteger(maxResults) && maxResults >= 1 && maxResults <= 100
      ? maxResults
      : 8,
    ...(extractor ? { extractor } : {}),
    ...(transformer ? { transformer } : {}),
  };
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

export function normalizePluginReferenceTarget(target: string) {
  const normalized = target.trim();
  if (
    normalized.startsWith("local:")
    || normalized.startsWith("path:")
    || normalized.startsWith("id:")
    || normalized.startsWith("container:")
    || normalized.startsWith("config:")
  ) {
    return normalized;
  }
  if (normalized) {
    return `container:auto/${normalized}`;
  }
  throw new Error("引用目标不能为空。");
}

export function parseContainerReferenceTarget(target: string): {
  scope: PluginContainerQueryScope | "auto";
  name: string;
} {
  const normalized = normalizePluginReferenceTarget(target);
  const match = /^container:(root|plugin|global|depth|auto)\/(.+)$/.exec(normalized);
  if (!match) {
    throw new Error(`容器引用格式无效：${normalized}`);
  }
  if (match[1] === "depth" && !/^(0|[1-9]\d*)$/.test(match[2]!.trim())) {
    throw new Error(`深度容器必须使用非负整数：${normalized}`);
  }
  return {
    scope: match[1] as PluginContainerQueryScope | "auto",
    name: match[2]!.trim(),
  };
}

export function pluginReferenceKind(target: string) {
  const separator = target.indexOf(":");
  return separator < 0 ? "container" : target.slice(0, separator);
}

export function pluginReferenceLabel(target: string) {
  const separator = target.indexOf(":");
  return separator < 0 ? target : target.slice(separator + 1);
}

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
