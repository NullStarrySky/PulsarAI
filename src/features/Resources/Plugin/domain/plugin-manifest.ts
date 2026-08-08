export type PluginManifestValue =
  | null
  | boolean
  | number
  | string
  | PluginManifestValue[]
  | { [key: string]: PluginManifestValue };

export interface PluginManifestContent {
  id: string;
  title: string;
  description?: string;
  component: string;
  props?: Record<string, PluginManifestValue>;
  value: PluginManifestValue;
}

export interface PluginManifestGroupContent {
  group: {
    id: string;
    title: string;
    description?: string;
  };
  content: PluginManifestContent[];
}

export type PluginManifest = PluginManifestGroupContent[];

export const pluginManifestFixedSettings = {
  model: {
    groupId: "generation",
    groupTitle: "生成",
    contentId: "model",
    title: "模型",
    description: "留空时继承全局默认聊天模型。",
    component: "ModelSelect",
  },
  reasoningEffort: {
    groupId: "generation",
    groupTitle: "生成",
    contentId: "reasoningEffort",
    title: "推理强度",
    description: "留空时继承全局推理强度。",
    component: "ReasoningEffortSelect",
  },
  background: {
    groupId: "appearance",
    groupTitle: "外观",
    contentId: "background",
    title: "会话背景",
    description: "留空时读取内置插件的背景配置。",
    component: "MediaSelect",
  },
} as const;

export type PluginManifestFixedSetting = keyof typeof pluginManifestFixedSettings;

export interface PluginManifestDiagnostic {
  path: string;
  message: string;
}

export interface PluginManifestReference {
  scope: "local" | "global";
  pluginId?: string;
  groupId: string;
  contentId: string;
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function parsePluginManifest(value: unknown): {
  manifest: PluginManifest;
  diagnostics: PluginManifestDiagnostic[];
} {
  if (typeof value === "string") {
    try {
      return parsePluginManifest(JSON.parse(value));
    } catch (error) {
      return {
        manifest: [],
        diagnostics: [{
          path: "$",
          message: error instanceof Error ? error.message : "manifest.json 语法错误。",
        }],
      };
    }
  }
  const diagnostics: PluginManifestDiagnostic[] = [];
  if (!Array.isArray(value)) {
    return {
      manifest: [],
      diagnostics: [{ path: "$", message: "manifest.json 根节点必须是 GroupContent[]。" }],
    };
  }

  const groupIds = new Set<string>();
  const manifest = value.flatMap((rawGroup, groupIndex) => {
    const path = `$[${groupIndex}]`;
    if (!isRecord(rawGroup) || !isRecord(rawGroup.group) || !Array.isArray(rawGroup.content)) {
      diagnostics.push({ path, message: "每一项必须包含 group 对象和 content 数组。" });
      return [];
    }
    const groupId = normalizedId(rawGroup.group.id);
    if (!groupId) {
      diagnostics.push({ path: `${path}.group.id`, message: "group.id 不能为空。" });
      return [];
    }
    if (groupIds.has(groupId)) {
      diagnostics.push({ path: `${path}.group.id`, message: `group.id 重复：${groupId}` });
    }
    groupIds.add(groupId);
    const contentIds = new Set<string>();
    const content = rawGroup.content.flatMap((rawContent, contentIndex) => {
      const contentPath = `${path}.content[${contentIndex}]`;
      if (!isRecord(rawContent)) {
        diagnostics.push({ path: contentPath, message: "content 项必须是对象。" });
        return [];
      }
      const id = normalizedId(rawContent.id);
      if (!id) {
        diagnostics.push({ path: `${contentPath}.id`, message: "content.id 不能为空。" });
        return [];
      }
      if (contentIds.has(id)) {
        diagnostics.push({ path: `${contentPath}.id`, message: `content.id 重复：${id}` });
      }
      contentIds.add(id);
      const component = normalizedText(rawContent.component) || "Input";
      const props = isRecord(rawContent.props) && isJsonValue(rawContent.props)
        ? cloneJsonValue(rawContent.props) as Record<string, PluginManifestValue>
        : undefined;
      if (rawContent.props !== undefined && !props) {
        diagnostics.push({ path: `${contentPath}.props`, message: "props 必须是 JSON 对象。" });
      }
      const manifestValue = rawContent.value === undefined ? null : rawContent.value;
      if (!isJsonValue(manifestValue)) {
        diagnostics.push({ path: `${contentPath}.value`, message: "value 必须是 JSON 值。" });
        return [];
      }
      return [{
        id,
        title: normalizedText(rawContent.title) || id,
        ...(normalizedText(rawContent.description)
          ? { description: normalizedText(rawContent.description) }
          : {}),
        component,
        ...(props ? { props } : {}),
        value: cloneJsonValue(manifestValue),
      } satisfies PluginManifestContent];
    });
    return [{
      group: {
        id: groupId,
        title: normalizedText(rawGroup.group.title) || groupId,
        ...(normalizedText(rawGroup.group.description)
          ? { description: normalizedText(rawGroup.group.description) }
          : {}),
      },
      content,
    } satisfies PluginManifestGroupContent];
  });
  return { manifest, diagnostics };
}

export function parsePluginManifestReference(rawReference: string): PluginManifestReference {
  const reference = rawReference.trim();
  const local = /^config:local\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/.exec(reference);
  if (local) {
    return {
      scope: "local",
      groupId: local[1]!,
      contentId: local[2]!,
    };
  }
  const global = /^config:global\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/.exec(reference);
  if (global) {
    return {
      scope: "global",
      pluginId: global[1]!,
      groupId: global[2]!,
      contentId: global[3]!,
    };
  }
  throw new Error(
    `配置引用格式无效：${rawReference}；应使用 config:local/group/content 或 config:global/pluginId/group/content。`,
  );
}

export function manifestValueAt(
  manifest: PluginManifest,
  groupId: string,
  contentId: string,
): PluginManifestValue {
  const content = manifest
    .find((item) => item.group.id === groupId)
    ?.content.find((item) => item.id === contentId);
  if (!content) throw new Error(`Manifest 配置不存在：${groupId}/${contentId}`);
  return cloneJsonValue(content.value);
}

export function pluginManifestFixedValue(
  manifest: PluginManifest,
  setting: PluginManifestFixedSetting,
) {
  const definition = pluginManifestFixedSettings[setting];
  const content = manifest
    .find((item) => item.group.id === definition.groupId)
    ?.content.find((item) => item.id === definition.contentId);
  return content ? cloneJsonValue(content.value) : null;
}

export function setPluginManifestFixedValue(
  manifest: PluginManifest,
  setting: PluginManifestFixedSetting,
  value: PluginManifestValue,
) {
  if (!isJsonValue(value)) throw new Error("Manifest 配置只能写入 JSON 值。");
  const definition = pluginManifestFixedSettings[setting];
  let group = manifest.find((item) => item.group.id === definition.groupId);
  if (!group) {
    group = {
      group: { id: definition.groupId, title: definition.groupTitle },
      content: [],
    };
    manifest.push(group);
  }
  let content = group.content.find((item) => item.id === definition.contentId);
  if (!content) {
    content = {
      id: definition.contentId,
      title: definition.title,
      description: definition.description,
      component: definition.component,
      value: null,
    };
    group.content.push(content);
  }
  content.value = cloneJsonValue(value);
  return manifest;
}

export function pluginGeneratePath(manifest: PluginManifest) {
  const value = manifestValueAt(manifest, "runtime", "generatePath");
  if (typeof value !== "string" || !value.trim()) return null;
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

export function setManifestValue(
  manifest: PluginManifest,
  groupId: string,
  contentId: string,
  value: PluginManifestValue,
) {
  if (!isJsonValue(value)) throw new Error("Manifest 配置只能写入 JSON 值。");
  const content = manifest
    .find((item) => item.group.id === groupId)
    ?.content.find((item) => item.id === contentId);
  if (!content) throw new Error(`Manifest 配置不存在：${groupId}/${contentId}`);
  content.value = cloneJsonValue(value);
  return manifest;
}

export function isJsonValue(value: unknown): value is PluginManifestValue {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function normalizedId(value: unknown) {
  const id = normalizedText(value);
  return /^[A-Za-z0-9._-]+$/.test(id) ? id : "";
}

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
