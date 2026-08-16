import type { PluginManifestValue } from "@/features/Resources/Plugin/editors/manifest/plugin-manifest";

export interface PluginConfigChange {
  pluginId: string;
  groupId: string;
  contentId: string;
  value: PluginManifestValue;
}

const listeners = new Set<(change: PluginConfigChange) => void>();

export function emitPluginConfigChange(change: PluginConfigChange) {
  for (const listener of listeners) listener(change);
}

export function onPluginConfigChange(listener: (change: PluginConfigChange) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
