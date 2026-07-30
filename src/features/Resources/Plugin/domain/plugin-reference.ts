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
  imports: PluginContainerImport[];
}

export interface PluginContainerMembership {
  container: string;
  alias: string;
}

export interface PluginResourceManifest {
  source: string;
  containers: PluginContainerDeclaration[];
  memberships: PluginContainerMembership[];
}

const referencePattern = /<@([^>\r\n]+)>/g;
const containerPattern =
  /<container\b([^>]*?)(?:\/>|>([\s\S]*?)<\/container\s*>)/gi;
const membershipPattern = /<member_of\b([^>]*?)\/?>/gi;
const includePattern =
  /<include\b([^>]*?)(?:\/>|>([\s\S]*?)<\/include\s*>)/gi;
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

export function parsePluginResourceManifest(source: string): PluginResourceManifest {
  const containers: PluginContainerDeclaration[] = [];
  const memberships: PluginContainerMembership[] = [];

  const withoutContainers = source.replace(
    containerPattern,
    (_whole, rawAttributes: string, body: string | undefined) => {
      const attributes = parseAttributes(rawAttributes);
      const name = attributes.name?.trim();
      const scope = normalizeContainerScope(attributes.scope);
      if (name) {
        const imports: PluginContainerImport[] = [];
        for (const match of (body ?? "").matchAll(includePattern)) {
          const includeAttributes = parseAttributes(match[1] ?? "");
          const target = (includeAttributes.ref ?? match[2] ?? "").trim();
          if (!target) continue;
          imports.push({
            alias:
              includeAttributes.as?.trim()
              || containerTargetName(target)
              || `container${imports.length + 1}`,
            target,
          });
        }
        containers.push({ name, scope, imports });
      }
      return "";
    },
  );

  const strippedSource = withoutContainers.replace(
    membershipPattern,
    (_whole, rawAttributes: string) => {
      const attributes = parseAttributes(rawAttributes);
      const container = attributes.container?.trim();
      if (container) {
        memberships.push({
          container,
          alias: attributes.as?.trim() || "",
        });
      }
      return "";
    },
  );

  return {
    source: strippedSource.replace(/^\s*\r?\n/, ""),
    containers,
    memberships,
  };
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
    attributes[key] = match[2] ?? match[3] ?? "";
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
