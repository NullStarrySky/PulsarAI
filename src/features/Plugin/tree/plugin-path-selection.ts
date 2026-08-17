import {
  pluginFileType,
  pluginFiles,
  type Plugin,
  type PluginFile,
} from "@/features/Plugin/tree/plugin-types";

export interface PluginPathSelectionOption {
  value: string;
  path: string;
  label: string;
  pluginId: string;
  pluginName: string;
  file: PluginFile;
}

export function pluginPathSelectionValue(path: string) {
  return path.replace(/\\/g, "/").replace(/(?:\.chat|\.data)?\.[^./]+$/i, "");
}

function pluginFileContainerId(file: PluginFile) {
  const target = file.insertion?.target.trim();
  if (!target) return null;
  const segments = target.replace(/\\/g, "/").split("/").filter(Boolean);
  return segments[segments.length - 1] ?? null;
}

export function listPluginPathSelectionOptions(
  plugins: Plugin[],
  options: { pathRegex?: string; containerId?: string } = {},
) {
  const pattern = compilePathRegex(options.pathRegex);
  const candidates = prioritizedPlugins(plugins).flatMap((plugin) =>
    pluginFiles(plugin).flatMap((file): PluginPathSelectionOption[] => {
      const path = file.path;
      pattern.lastIndex = 0;
      if (!pattern.test(path)) return [];
      if (options.containerId && pluginFileContainerId(file) !== options.containerId) return [];
      const value = pluginPathSelectionValue(path);
      return [{
        value,
        path,
        label: value,
        pluginId: plugin.id,
        pluginName: plugin.name,
        file,
      }];
    })
  );
  const unique = new Map<string, PluginPathSelectionOption>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.value)) unique.set(candidate.value, candidate);
  }
  return [...unique.values()];
}

export function backgroundPathSelectionOptions(plugins: Plugin[]) {
  return listPluginPathSelectionOptions(plugins, {
    containerId: "background",
    pathRegex: "^background/.+\\.(?:png|jpe?g|gif|webp|avif|svg|mp4|webm)$",
  }).filter((candidate) => pluginFileType(candidate.file.name) === "media");
}

function prioritizedPlugins(plugins: Plugin[]) {
  return [...new Map(plugins.map((plugin) => [plugin.id, plugin])).values()]
    .map((plugin, index) => ({ plugin, index }))
    .sort((left, right) =>
      pluginPriority(left.plugin) - pluginPriority(right.plugin)
      || left.index - right.index
    )
    .map(({ plugin }) => plugin);
}

function pluginPriority(plugin: Plugin) {
  if (plugin.packageId !== null) return 0;
  return plugin.builtIn ? 2 : 1;
}

function compilePathRegex(source?: string) {
  try {
    return new RegExp(source?.trim() || ".*");
  } catch {
    return /$a/;
  }
}
