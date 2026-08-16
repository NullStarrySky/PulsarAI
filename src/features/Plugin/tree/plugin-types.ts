export interface PluginTreeNodeBase {
  id: string;
  name: string;
  icon: string;
  treeOrder: number;
}

export interface PluginFile extends PluginTreeNodeBase {
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

export interface PluginFolder extends PluginTreeNodeBase {
  kind: "folder";
  children: PluginTreeNode[];
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
  root: PluginFolder;
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

export function sortPluginTreeNodes(nodes: PluginTreeNode[]) {
  return [...nodes].sort(
    (a, b) =>
      Number(b.kind === "folder") - Number(a.kind === "folder")
      || (a.treeOrder ?? 0) - (b.treeOrder ?? 0)
      || a.name.localeCompare(b.name, "zh-Hans")
      || a.id.localeCompare(b.id),
  );
}

export function findPluginTreeNode(
  root: PluginFolder,
  nodeId: string,
): PluginTreeNode | null {
  if (root.id === nodeId) return root;
  for (const child of root.children) {
    if (child.id === nodeId) return child;
    if (child.kind === "folder") {
      const match = findPluginTreeNode(child, nodeId);
      if (match) return match;
    }
  }
  return null;
}

export function findPluginTreeParent(
  root: PluginFolder,
  nodeId: string,
): PluginFolder | null {
  for (const child of root.children) {
    if (child.id === nodeId) return root;
    if (child.kind === "folder") {
      const match = findPluginTreeParent(child, nodeId);
      if (match) return match;
    }
  }
  return null;
}

export function findPluginChildByName(
  folder: PluginFolder,
  name: string,
): PluginTreeNode | null {
  const normalized = name.trim().toLocaleLowerCase();
  return folder.children.find(
    (child) => child.name.trim().toLocaleLowerCase() === normalized,
  ) ?? null;
}

export function findPluginNodeByPath(
  root: PluginFolder,
  path: string | string[],
): PluginTreeNode | null {
  const parts = Array.isArray(path)
    ? path
    : path.split("/").map((part) => part.trim()).filter(Boolean);
  let current: PluginTreeNode = root;
  for (const part of parts) {
    if (current.kind !== "folder") return null;
    const child = findPluginChildByName(current, part);
    if (!child) return null;
    current = child;
  }
  return current;
}

export function flattenPluginFiles(folder: PluginFolder): PluginFile[] {
  return sortPluginTreeNodes(folder.children).flatMap((child) =>
    child.kind === "file" ? [child] : flattenPluginFiles(child),
  );
}

export function pluginNodePath(root: PluginFolder, nodeId: string): string[] {
  if (root.id === nodeId) return [];
  for (const child of root.children) {
    if (child.id === nodeId) return [child.name];
    if (child.kind === "folder") {
      const nested = pluginNodePath(child, nodeId);
      if (nested.length) return [child.name, ...nested];
    }
  }
  return [];
}
