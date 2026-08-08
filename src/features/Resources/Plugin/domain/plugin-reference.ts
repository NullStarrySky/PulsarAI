import { pluginFileType } from "./plugin-types";

export type PluginContainerScope = "local" | "global";

export interface PluginContainerDeclaration {
  id: string;
  title: string;
  scope: PluginContainerScope;
  description: string;
  contentSuffixes: string[];
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
    const id = normalizedText(rawContainer.id);
    if (!id) {
      diagnostics.push({ path: `${path}.id`, message: "容器 ID 不能为空。" });
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
    const title = normalizedText(rawContainer.title);
    if (!title) diagnostics.push({ path: `${path}.title`, message: "title 不能为空。" });
    const description = normalizedText(rawContainer.description);
    const contentSuffixes = Array.isArray(rawContainer.contentSuffixes)
      ? rawContainer.contentSuffixes.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase()).filter(Boolean)
      : [];
    if (!Array.isArray(rawContainer.contentSuffixes)) {
      diagnostics.push({ path: `${path}.contentSuffixes`, message: "contentSuffixes 必须是字符串数组。" });
    }
    containers.push({
      id,
      title: title || id,
      scope,
      description,
      contentSuffixes,
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

export function pluginFileMatchesContainerSuffix(
  name: string,
  suffixes: string[],
) {
  const normalized = name.trim().toLowerCase();
  const media = pluginFileType(name) === "media";
  return suffixes.some((suffix) => {
    const expected = suffix.trim().toLowerCase().replace(/^\./, "");
    return expected === "*"
      || (expected === "media" && media)
      || normalized.endsWith(`.${expected}`);
  });
}

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
