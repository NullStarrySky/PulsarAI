import { host } from "@/host";
import { markLocalDatabaseChange } from "@/features/Database/sync-metadata";
import type { Plugin } from "@/features/Plugin/tree/plugin-types";

const pluginTable = "resource_plugins";

export interface PluginSearchHit {
  pluginId: string;
  pluginName: string;
  nodeId: string;
  path: string;
  name: string;
  kind: "file" | "folder";
  excerpt: string;
}

export async function loadPersistedPlugins() {
  return host.plugins.load<Plugin>();
}

export async function savePersistedPlugin(plugin: Plugin) {
  await host.plugins.save(plugin);
  markLocalDatabaseChange(pluginTable, plugin.id, false, plugin);
}

export async function deletePersistedPlugin(plugin: Plugin) {
  await host.plugins.remove(plugin.id);
  markLocalDatabaseChange(pluginTable, plugin.id, true, plugin);
}

export async function searchPersistedPluginNodes(query: string, limit = 40) {
  const normalized = query.trim();
  if (!normalized) return [];
  return host.plugins.search<PluginSearchHit>(normalized, limit);
}
