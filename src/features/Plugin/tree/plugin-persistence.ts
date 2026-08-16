import { invoke } from "@tauri-apps/api/core";
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
  return invoke<Plugin[]>("database_load_plugins");
}

export async function savePersistedPlugin(plugin: Plugin) {
  await invoke<void>("database_save_plugin", { plugin });
  markLocalDatabaseChange(pluginTable, plugin.id, false, plugin);
}

export async function deletePersistedPlugin(plugin: Plugin) {
  await invoke<void>("database_delete_plugin", { pluginId: plugin.id });
  markLocalDatabaseChange(pluginTable, plugin.id, true, plugin);
}

export async function searchPersistedPluginNodes(query: string, limit = 40) {
  const normalized = query.trim();
  if (!normalized) return [];
  return invoke<PluginSearchHit[]>("database_search_plugin_nodes", {
    query: normalized,
    limit,
  });
}
