export type PluginContainerScope = "root" | "plugin" | "global";

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
}

const referencePattern = /<@([^>\r\n]+)>/g;
const containerPattern =
  /<container\b([^>]*?)(?:\/>|>([\s\S]*?)<\/container\s*>)/gi;
const includePattern =
  /<include\b([^>]*?)(?:\/>|>([\s\S]*?)<\/include\s*>)/gi;
const descriptionPattern =
  /<description\b[^>]*>([\s\S]*?)<\/description\s*>/i;
const attributePattern =
  /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

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

function parseContainerDeclarations(source: string) {
  const containers: PluginContainerDeclaration[] = [];
  for (const match of source.matchAll(containerPattern)) {
    const rawAttributes = match[1] ?? "";
    const body = match[2];
    const attributes = parseAttributes(rawAttributes);
    const name = attributes.name?.trim();
    const scope = normalizeContainerScope(attributes.scope);
    if (!name) continue;
    const description = decodeXml(
      descriptionPattern.exec(body ?? "")?.[1]?.trim() ?? "",
    );
    const imports: PluginContainerImport[] = [];
    for (const includeMatch of (body ?? "").matchAll(includePattern)) {
      const includeAttributes = parseAttributes(includeMatch[1] ?? "");
      const target = includeAttributes.ref?.trim()
        ?? decodeXml((includeMatch[2] ?? "").trim());
      if (!target) continue;
      imports.push({
        alias:
          includeAttributes.as?.trim()
          || containerTargetName(target)
          || `container${imports.length + 1}`,
        target,
      });
    }
    containers.push({ name, scope, description, imports });
  }
  return containers;
}

export function parsePluginContainerDefinitions(
  source: string,
): PluginContainerDefinitions {
  return {
    containers: parseContainerDeclarations(source),
  };
}

export function serializePluginContainerDefinitions(
  definitions: PluginContainerDefinitions,
) {
  const lines = ["<containers>"];
  definitions.containers.forEach((container, index) => {
    if (index > 0) lines.push("");
    const attributes =
      `name="${escapeXmlAttribute(container.name)}" scope="${container.scope}"`;
    const description = container.description?.trim() ?? "";
    if (!container.imports.length && !description) {
      lines.push(`  <container ${attributes} />`);
      return;
    }
    lines.push(`  <container ${attributes}>`);
    if (description) {
      lines.push(`    <description>${escapeXmlText(description)}</description>`);
    }
    for (const item of container.imports) {
      lines.push(
        `    <include as="${escapeXmlAttribute(item.alias)}">${
          escapeXmlText(item.target)
        }</include>`,
      );
    }
    lines.push("  </container>");
  });
  lines.push("</containers>", "");
  return lines.join("\n");
}

export function normalizePluginReferenceTarget(target: string) {
  const normalized = target.trim();
  if (
    normalized.startsWith("local:")
    || normalized.startsWith("path:")
    || normalized.startsWith("id:")
    || normalized.startsWith("container:")
  ) {
    return normalized;
  }
  if (normalized) {
    return `container:auto/${normalized}`;
  }
  throw new Error("引用目标不能为空。");
}

export function parseContainerReferenceTarget(target: string): {
  scope: PluginContainerScope | "auto";
  name: string;
} {
  const normalized = normalizePluginReferenceTarget(target);
  const match = /^container:(root|plugin|global|auto)\/(.+)$/.exec(normalized);
  if (!match) {
    throw new Error(`容器引用格式无效：${normalized}`);
  }
  return {
    scope: match[1] as PluginContainerScope | "auto",
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

function parseAttributes(source: string) {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(attributePattern)) {
    const key = (match[1] ?? "").toLocaleLowerCase();
    if (!key) continue;
    attributes[key] = decodeXml(match[2] ?? match[3] ?? "");
  }
  return attributes;
}

function normalizeContainerScope(value?: string): PluginContainerScope {
  return value === "root" || value === "global" ? value : "plugin";
}

function containerTargetName(target: string) {
  const normalized = target.trim();
  const index = normalized.lastIndexOf("/");
  return index < 0 ? normalized : normalized.slice(index + 1);
}

function escapeXmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
