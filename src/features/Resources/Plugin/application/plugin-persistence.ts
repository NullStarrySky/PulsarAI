import { invoke } from "@tauri-apps/api/core";
import { traceDatabaseOperation } from "@/features/Database/application/database-log";
import { markLocalDatabaseChange } from "@/features/Database/application/sync-metadata";
import type { Plugin } from "@/features/Resources/Plugin/domain/plugin-types";

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
  return traceDatabaseOperation(
    "loadPlugins",
    { table: pluginTable },
    () => invoke<Plugin[]>("database_load_plugins"),
    (result) => ({ count: result.length }),
  );
}

export async function savePersistedPlugin(plugin: Plugin) {
  await traceDatabaseOperation(
    "savePlugin",
    { table: pluginTable, id: plugin.id },
    () => invoke<void>("database_save_plugin", { plugin }),
  );
  markLocalDatabaseChange(pluginTable, plugin.id, false, plugin);
}

export async function deletePersistedPlugin(plugin: Plugin) {
  await traceDatabaseOperation(
    "deletePlugin",
    { table: pluginTable, id: plugin.id },
    () => invoke<void>("database_delete_plugin", { pluginId: plugin.id }),
  );
  markLocalDatabaseChange(pluginTable, plugin.id, true, plugin);
}

export async function searchPersistedPluginNodes(query: string, limit = 40) {
  const normalized = query.trim();
  if (!normalized) return [];
  return traceDatabaseOperation(
    "searchPluginNodes",
    { table: "resource_plugin_nodes", queryLength: normalized.length, limit },
    () => invoke<PluginSearchHit[]>("database_search_plugin_nodes", {
      query: normalized,
      limit,
    }),
    (result) => ({ count: result.length }),
  );
}
