import {
  parsePluginManifest,
  pluginGeneratePath,
  pluginManifestFixedValue,
  type PluginManifestFixedSetting,
} from "@/features/Plugin/editors/manifest/plugin-manifest";
import { findPluginNodeByPath, pluginConventions, pluginFileType, type Plugin } from "@/features/Plugin/tree/plugin-types";

export function pluginGenerateFile(plugin: Plugin) {
  const manifest = findPluginNodeByPath(plugin.root, pluginConventions.manifest);
  if (manifest?.kind !== "file") return null;
  const parsed = parsePluginManifest(manifest.content);
  if (parsed.diagnostics.length) return null;
  let path: string | null = null;
  try {
    path = pluginGeneratePath(parsed.manifest);
  } catch {
    return null;
  }
  if (!path || path.split("/").includes("..")) return null;
  const file = findPluginNodeByPath(plugin.root, path);
  return file?.kind === "file"
      && pluginFileType(file.name) === "javascript"
      && typeof file.content === "string"
      && file.content.trim()
    ? file
    : null;
}

export function pluginFixedSettingValue(
  plugin: Plugin,
  setting: PluginManifestFixedSetting,
) {
  const manifest = findPluginNodeByPath(plugin.root, pluginConventions.manifest);
  if (manifest?.kind !== "file") return null;
  const parsed = parsePluginManifest(manifest.content);
  if (parsed.diagnostics.length) return null;
  return pluginManifestFixedValue(parsed.manifest, setting);
}
