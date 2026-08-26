import { defineStore } from "pinia";
import {
  parsePluginSlots,
  type PluginSlot,
} from "@/features/Plugin/editors/slot/plugin-slot";
import { usePluginStore } from "./plugin-store";
import {
  findPluginNodeByPath,
  pluginConventions,
  pluginFileType,
  type Plugin,
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
};
export type SlotQuery = PluginSlot & {
  pluginId: string;
  pluginName?: string;
  resources: SlotResource[];
  contents: SlotResource[];
  contentCount: number;
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
      const definitions: Array<{ slot: PluginSlot; pluginId: string }> = [];
      for (const slot of parsePluginSlots(coreSlots))
        if (!definitions.some((item) => item.slot.id === slot.id))
          definitions.push({ slot, pluginId: "builtin-core-plugin" });
      for (const plugin of plugins) {
        const node = findPluginNodeByPath(plugin, "slots.json");
        if (node?.kind !== "file") continue;
        for (const slot of parsePluginSlots(node.content))
          if (!definitions.some((item) => item.slot.id === slot.id))
            definitions.push({ slot, pluginId: plugin.id });
      }
      return definitions.map(({ slot, pluginId }) => {
        const resources = plugins.flatMap((plugin) =>
          plugin.files.flatMap((node) =>
            ((node.insertion?.slot === slot.id &&
              pluginFileMatchesSlotSuffix(node.name, slot.contentSuffixes)) ||
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
        return {
          ...slot,
          pluginId,
          pluginName: plugins.find((plugin) => plugin.id === pluginId)?.name,
          resources,
          contents: resources,
          contentCount: resources.length,
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
  },
});
