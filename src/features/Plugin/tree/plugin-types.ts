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
    slot: string;
    condition?: string;
    /** A synchronous JavaScript resource, resolved from this file, returning a boolean. */
    conditionPath?: string;
  };
}

export interface PluginFolder extends PluginNodeBase {
  kind: "folder";
}

export type PluginTreeNode = PluginFile | PluginFolder;

export interface Plugin {
  id: string;
  packageId: string | null;
  name: string;
  icon: string;
  shortDescription: string;
  /** Persisted resources. Non-empty directories are inferred from these paths. */
  files: PluginFile[];
  /** Persisted leaf directories that currently contain no files or child directories. */
  emptyFolders: string[];
  builtIn: boolean;
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
  config: "config.json",
  slots: "slots.json",
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
      Number(b.kind === "folder") - Number(a.kind === "folder") ||
      (a.kind === "file" ? a.treeOrder : 0) -
        (b.kind === "file" ? b.treeOrder : 0) ||
      a.name.localeCompare(b.name, "zh-Hans") ||
      a.id.localeCompare(b.id),
  );
}

function normalizeNodePath(path: string | string[]) {
  const joined = Array.isArray(path) ? path.join("/") : path;
  return joined
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

export function findPluginNodeByPath(
  plugin: Plugin,
  path: string | string[],
): PluginTreeNode | null {
  const normalized = normalizeNodePath(path);
  if (!normalized) return null;
  const file = plugin.files.find((item) => item.path === normalized);
  if (file) return file;
  return pluginDirectoryPaths(plugin).has(normalized)
    ? pluginFolder(normalized)
    : null;
}

export function findPluginTreeNode(
  plugin: Plugin,
  nodeId: string,
): PluginTreeNode | null {
  const file = plugin.files.find((item) => item.id === nodeId);
  if (file) return file;
  const prefix = "folder:";
  if (!nodeId.startsWith(prefix)) return null;
  const path = nodeId.slice(prefix.length);
  return pluginDirectoryPaths(plugin).has(path) ? pluginFolder(path) : null;
}

/** Sorted child nodes of one directory; `folderPath === ""` selects plugin root. */
export function pluginChildNodes(
  plugin: Plugin,
  folderPath: string,
): PluginTreeNode[] {
  const normalized = normalizeNodePath(folderPath);
  const children: PluginTreeNode[] = plugin.files.filter(
    (file) => pluginParentPath(file.path) === normalized,
  );
  for (const path of pluginDirectoryPaths(plugin)) {
    if (pluginParentPath(path) === normalized)
      children.push(pluginFolder(path));
  }
  return sortPluginTreeNodes(children);
}

export function pluginFiles(plugin: Plugin): PluginFile[] {
  return plugin.files;
}

export function pluginDirectoryPaths(plugin: Plugin) {
  const paths = new Set<string>();
  for (const source of [
    ...plugin.files.map((file) => pluginParentPath(file.path)),
    ...plugin.emptyFolders,
  ]) {
    let current = normalizeNodePath(source);
    while (current) {
      paths.add(current);
      current = pluginParentPath(current);
    }
  }
  return paths;
}

export function pluginDirectoryExists(plugin: Plugin, path: string) {
  const normalized = normalizeNodePath(path);
  return !normalized || pluginDirectoryPaths(plugin).has(normalized);
}

export function pluginFolder(path: string): PluginFolder {
  const normalized = normalizeNodePath(path);
  return {
    id: `folder:${normalized}`,
    path: normalized,
    name: normalized.slice(normalized.lastIndexOf("/") + 1),
    icon: "",
    treeOrder: 0,
    kind: "folder",
  };
}
