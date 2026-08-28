import { defineStore } from "pinia";
import {
  parsePluginSlots,
  selectPluginSlotResources,
  type PluginSlot,
} from "@/features/Plugin/editors/slot/plugin-slot";
import { usePluginStore } from "./plugin-store";
import {
  findPluginNodeByPath,
  pluginConventions,
  pluginFileType,
  type Plugin,
  type PluginFile,
} from "./plugin-types";
import coreSlots from "@/features/Plugin/builtIn/core/slots.json";

export { parsePluginSlots, type PluginSlot };
export type SlotResource = {
  id: string;
  pluginId: string;
  pluginName: string;
  name: string;
  type: string;
  path: string;
  order: number;
  condition?: string;
  conditionPath?: string;
  file: PluginFile;
};
export type SlotQuery = PluginSlot & {
  pluginId: string;
  pluginName?: string;
  resources: SlotResource[];
};

export function pluginFileMatchesSlotSuffix(name: string, suffixes: string[]) {
  const normalized = name.trim().toLowerCase();
  return suffixes.some((suffix) => {
    const expected = suffix.trim().toLowerCase().replace(/^\./, "");
    return (
      expected === "*" ||
      (expected === "media" && pluginFileType(name) === "media") ||
      normalized.endsWith(`.${expected}`)
    );
  });
}

export const useSlotStore = defineStore("plugin-slots", {
  actions: {
    listSlots(plugins: Plugin[] = usePluginStore().sortedPlugins): SlotQuery[] {
      const coreDefinitions = parsePluginSlots(coreSlots).map((slot) => ({
        slot,
        pluginId: "builtin-core-plugin",
      }));
      const pluginDefinitions = plugins.flatMap((plugin) => {
        const node = findPluginNodeByPath(plugin, "slots.json");
        return node?.kind === "file"
          ? parsePluginSlots(node.content).map((slot) => ({
              slot,
              pluginId: plugin.id,
            }))
          : [];
      });
      const definitions: Array<{ slot: PluginSlot; pluginId: string }> = [];
      for (const definition of [...coreDefinitions, ...pluginDefinitions])
        if (!definitions.some((item) => item.slot.id === definition.slot.id))
          definitions.push(definition);
      return definitions.map(({ slot, pluginId }) => {
        const resources = plugins.flatMap((plugin) =>
          plugin.files.flatMap((node) =>
            ((node.insertion?.slot === slot.id &&
              pluginFileMatchesSlotSuffix(node.name, slot.contentSuffixes)) ||
              (slot.id === "toolFunction" &&
                /^tools\/[^/]+\/prompt\.md$/i.test(node.path) &&
                plugin.files.some((file) =>
                  file.path === node.path.replace(/prompt\.md$/i, "tool.js"),
                )) ||
              (slot.id === "REGEX" &&
                plugin.enabled &&
                node.path === pluginConventions.regex))
              ? [
                  {
                    id: node.id,
                    pluginId: plugin.id,
                    pluginName: plugin.name,
                    name: node.name,
                    type: pluginFileType(node.name),
                    path: node.path,
                    order: node.order,
                    condition: node.insertion?.condition,
                    conditionPath: node.insertion?.conditionPath,
                    file: node,
                  },
                ]
              : [],
          ),
        );
        resources.sort(
          (a, b) =>
            a.order - b.order ||
            a.pluginId.localeCompare(b.pluginId) ||
            a.id.localeCompare(b.id),
        );
        const selector = pluginDefinitions.find(
          (item) =>
            item.slot.id === slot.id && item.slot.selectedPaths?.length,
        ) ?? (plugins.some((plugin) => plugin.id === "builtin-core-plugin")
          ? coreDefinitions.find(
              (item) => item.slot.id === slot.id && item.slot.selectedPaths?.length,
            )
          : undefined);
        const selected = selectPluginSlotResources(
          slot,
          resources,
          selector?.slot.selectedPaths,
          selector?.pluginId,
        );
        return {
          ...slot,
          pluginId,
          pluginName: plugins.find((plugin) => plugin.id === pluginId)?.name,
          resources: selected,
        };
      });
    },
    getSlot(id: string, scope?: "local" | "global", plugins?: Plugin[]) {
      return (
        this.listSlots(plugins).find(
          (slot) => slot.id === id && (!scope || slot.scope === scope),
        ) ?? null
      );
    },
    api(plugins: Plugin[] = usePluginStore().sortedPlugins) {
      const list = (scope?: "local" | "global") =>
        this.listSlots(plugins).filter(
          (slot) => !scope || slot.scope === scope,
        );
      const get = (id: string, scope?: "local" | "global") =>
        list(scope).find((slot) => slot.id === id) ?? null;
      const paths = (id: string, scope?: "local" | "global") =>
        (get(id, scope)?.resources ?? []).map(
          (resource) => `@${resource.pluginId}/${resource.path}`,
        );
      return { list, get, paths, import: paths };
    },
  },
});
