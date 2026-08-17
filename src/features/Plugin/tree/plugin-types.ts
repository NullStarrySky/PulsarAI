export interface PluginNodeBase {
  id: string;
  /** Plugin-relative path; its last segment always equals `name`. */
  path: string;
  name: string;
  icon: string;
  /** Sibling ordering within the parent directory. */
  treeOrder: number;
}

export interface PluginFile extends PluginNodeBase {
  kind: "file";
  content: unknown;
  order: number;
  insertion?: {
    target: string;
    condition?: string;
    /** A synchronous JavaScript resource, resolved from this file, returning a boolean. */
    conditionPath?: string;
  };
}

export interface PluginFolder extends PluginNodeBase {
  kind: "folder";
  /** Presentation-only collapse state; stripped before database persistence. */
  collapsed?: boolean;
}

export type PluginTreeNode = PluginFile | PluginFolder;

// Kept as a public alias because Conversation actions expose a resource object.
export type PluginResource = PluginFile;

export interface Plugin {
  id: string;
  packageId: string | null;
  name: string;
  icon: string;
  shortDescription: string;
  /** Flat path-keyed node list; folder rows exist for explicit and empty folders. */
  nodes: PluginTreeNode[];
  enabled: boolean;
  builtIn: boolean;
}

export interface ResolvedPluginAction {
  pluginId: string;
  pluginName: string;
  kind: "process" | "prompt" | "view";
  resource: PluginFile;
}

export type PluginFileType =
  | "markdown"
  | "chat"
  | "data"
  | "javascript"
  | "json"
  | "media"
  | "component"
  | "text";

export const pluginConventions = {
  manifest: "manifest.json",
  containers: "containers.json",
  regex: "regex.json",
  actionFolder: "action",
  toolsFolder: "tools",
  toolEntry: "tool.js",
  toolPrompt: "prompt.md",
  backgroundFolder: "background",
  cacheFolder: "cache",
  tempFolder: "temp",
  skillFolder: "skill",
  componentsFolder: "components",
} as const;

const markdownExtensions = new Set(["md", "markdown"]);
const javascriptExtensions = new Set(["js", "mjs", "cjs", "ts"]);
const jsonExtensions = new Set(["json"]);
const mediaExtensions = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "svg",
  "mp4",
  "webm",
  "ogg",
  "mov",
  "m4v",
]);
const componentExtensions = new Set(["vue", "jsx", "tsx"]);

export function pluginFileExtension(name: string) {
  const match = /\.([^.]+)$/.exec(name.trim().toLowerCase());
  return match?.[1] ?? "";
}

export function pluginFileType(name: string): PluginFileType {
  const normalized = name.trim().toLowerCase();
  if (normalized.endsWith(".chat.json")) return "chat";
  if (normalized.endsWith(".data.json")) return "data";
  const extension = pluginFileExtension(name);
  if (markdownExtensions.has(extension)) return "markdown";
  if (javascriptExtensions.has(extension)) return "javascript";
  if (jsonExtensions.has(extension)) return "json";
  if (mediaExtensions.has(extension)) return "media";
  if (componentExtensions.has(extension)) return "component";
  return "text";
}

/** Parent directory path of a plugin-relative path; `""` means plugin root. */
export function pluginParentPath(path: string) {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

export function sortPluginTreeNodes(nodes: PluginTreeNode[]) {
  return [...nodes].sort(
    (a, b) =>
      Number(b.kind === "folder") - Number(a.kind === "folder")
      || (a.treeOrder ?? 0) - (b.treeOrder ?? 0)
      || a.name.localeCompare(b.name, "zh-Hans")
      || a.id.localeCompare(b.id),
  );
}

function normalizeNodePath(path: string | string[]) {
  const joined = Array.isArray(path) ? path.join("/") : path;
  return joined.split("/").map((part) => part.trim()).filter(Boolean).join("/");
}

export function findPluginNodeByPath(
  plugin: Plugin,
  path: string | string[],
): PluginTreeNode | null {
  const normalized = normalizeNodePath(path);
  if (!normalized) return null;
  return plugin.nodes.find((node) => node.path === normalized) ?? null;
}

export function findPluginTreeNode(
  plugin: Plugin,
  nodeId: string,
): PluginTreeNode | null {
  return plugin.nodes.find((node) => node.id === nodeId) ?? null;
}

/** Sorted child nodes of one directory; `folderPath === ""` selects plugin root. */
export function pluginChildNodes(
  plugin: Plugin,
  folderPath: string,
): PluginTreeNode[] {
  const normalized = normalizeNodePath(folderPath);
  return sortPluginTreeNodes(
    plugin.nodes.filter((node) => pluginParentPath(node.path) === normalized),
  );
}

export function pluginFiles(plugin: Plugin): PluginFile[] {
  return plugin.nodes.filter((node): node is PluginFile => node.kind === "file");
}
