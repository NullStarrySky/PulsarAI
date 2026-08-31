import type { Plugin } from "./plugin-types";

export const worldGlobalFolder = "global";
export const worldSelfFolder = "self";
export const builtinCoreGenerationPath =
  "/global/builtin-core-plugin/generate.js";

export function normalizeWorldPath(path: string) {
  return path
    .trim()
    .replace(/^@?\/+/, "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

export function pluginWorldRoot(plugin: Plugin, packageId?: string | null) {
  return plugin.packageId === packageId ? worldSelfFolder : `${worldGlobalFolder}/${plugin.id}`;
}

export function pluginWorldPath(
  plugin: Plugin,
  path = "",
  packageId?: string | null,
) {
  const root = pluginWorldRoot(plugin, packageId);
  const normalized = normalizeWorldPath(path);
  return [root, normalized].filter(Boolean).join("/");
}

export function worldReference(path: string) {
  const normalized = normalizeWorldPath(path);
  return normalized ? `/${normalized}` : "/";
}

export function resolveWorldPath(
  plugins: Plugin[],
  packageId: string | null | undefined,
  request: string,
  localPluginId?: string,
) {
  const normalized = normalizeWorldPath(request);
  const parts = normalized.split("/");
  if (parts[0] === worldGlobalFolder && parts[1]) {
    const plugin = plugins.find((item) => item.id === parts[1] && item.packageId === null);
    if (!plugin) throw new Error(`全局资源挂载不存在：${parts[1]}`);
    return { plugin, path: parts.slice(2).join("/") };
  }
  if (parts[0] !== worldSelfFolder)
    throw new Error(`World 资源路径必须位于 /self 或 /global：${request}`);
  const plugin = plugins.find(
    (item) => item.id === localPluginId && item.packageId === packageId,
  ) ?? plugins.find((item) => item.packageId === packageId);
  if (!plugin) throw new Error("角色世界没有本地资源根。");
  return { plugin, path: parts.slice(1).join("/") };
}
