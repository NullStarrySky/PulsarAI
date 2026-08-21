import { defineStore } from "pinia";
import { push } from "notivue";
import { z } from "zod";
import { usePluginStore } from "./plugin-store";
import { findPluginNodeByPath, pluginFileType, type Plugin } from "./plugin-types";
import coreSlots from "@/features/Plugin/builtIn/core/slots.json";
import defaultSlots from "@/features/Plugin/builtIn/default/slots.json";

const slotSchema = z.object({ id: z.string().min(1), title: z.string().min(1), scope: z.enum(["local", "global"]), description: z.string().default(""), contentSuffixes: z.array(z.string()).default([]), selectionMode: z.enum(["single", "multiple", "none"]).default("none"), overrideStrategy: z.enum(["override", "merge", "intersection"]).default("override"), selectedPaths: z.array(z.string()).optional() });
const slotsSchema = z.object({ slots: z.array(slotSchema).default([]) });
export type PluginSlot = z.infer<typeof slotSchema>;
export type SlotResource = { id: string; pluginId: string; pluginName: string; name: string; type: string; path: string; order: number; condition?: string; conditionPath?: string };
export type SlotQuery = PluginSlot & { pluginId: string; pluginName?: string; resources: SlotResource[]; contents: SlotResource[]; contentCount: number };

export function parsePluginSlots(source: unknown) {
  let value = source;
  if (typeof source === "string") try { value = JSON.parse(source); } catch { value = null; }
  const parsed = slotsSchema.safeParse(value);
  if (!parsed.success) { push.warning("slots.json 类型无效，已忽略。"); return [] as PluginSlot[]; }
  return parsed.data.slots;
}

export function pluginFileMatchesSlotSuffix(name: string, suffixes: string[]) {
  const normalized = name.trim().toLowerCase();
  return suffixes.some((suffix) => {
    const expected = suffix.trim().toLowerCase().replace(/^\./, "");
    return expected === "*" || (expected === "media" && pluginFileType(name) === "media") || normalized.endsWith(`.${expected}`);
  });
}

export const useSlotStore = defineStore("plugin-slots", {
  actions: {
    listSlots(plugins: Plugin[] = usePluginStore().sortedPlugins): SlotQuery[] {
      const definitions: Array<{ slot: PluginSlot; pluginId: string }> = [];
      for (const [pluginId, source] of [["builtin-core-plugin", coreSlots], ["builtin-default-plugin", defaultSlots]] as const) for (const slot of parsePluginSlots(source)) if (!definitions.some((item) => item.slot.id === slot.id)) definitions.push({ slot, pluginId });
      for (const plugin of plugins) {
        const node = findPluginNodeByPath(plugin, "slots.json");
        if (node?.kind !== "file") continue;
        for (const slot of parsePluginSlots(node.content)) if (!definitions.some((item) => item.slot.id === slot.id)) definitions.push({ slot, pluginId: plugin.id });
      }
      return definitions.map(({ slot, pluginId }) => {
        const resources = plugins.flatMap((plugin) => plugin.nodes.flatMap((node) => node.kind === "file" && node.insertion?.slot === slot.id && pluginFileMatchesSlotSuffix(node.name, slot.contentSuffixes) ? [{ id: node.id, pluginId: plugin.id, pluginName: plugin.name, name: node.name, type: pluginFileType(node.name), path: node.path, order: node.order, condition: node.insertion.condition, conditionPath: node.insertion.conditionPath }] : []));
        resources.sort((a, b) => a.order - b.order || a.pluginId.localeCompare(b.pluginId) || a.id.localeCompare(b.id));
        return { ...slot, pluginId, pluginName: plugins.find((plugin) => plugin.id === pluginId)?.name, resources, contents: resources, contentCount: resources.length };
      });
    },
    getSlot(id: string, scope?: "local" | "global", plugins?: Plugin[]) { return this.listSlots(plugins).find((slot) => slot.id === id && (!scope || slot.scope === scope)) ?? null; },
  },
});
