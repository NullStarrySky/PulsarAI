import { defineStore } from "pinia";
import type { WorldConfig } from "@/features/Package/package-types";
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
import { pluginWorldPath, worldReference } from "./world-path";
import {
  createWorldConfig,
  isWorldPathDisabled,
} from "./world-config";

export { parsePluginSlots, type PluginSlot };
export type SlotResource = {
  id: string;
  pluginId: string;
  pluginName: string;
  name: string;
  type: string;
  path: string;
  worldPath: string;
  order: number;
  condition?: string;
  conditionPath?: string;
  file: PluginFile;
};
export interface SlotWorldOptions {
  packageId?: string;
  config?: WorldConfig;
  /** Limits local slot queries to the Plugin owning the current source. */
  sourcePluginId?: string;
}
export type SlotQuery = PluginSlot & {
  scope: "local" | "global";
  pluginId: string;
  pluginName?: string;
  allResources: SlotResource[];
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

function pluginSlotDefinitions(plugin: Plugin) {
  const node = findPluginNodeByPath(plugin, pluginConventions.slots);
  return node?.kind === "file" ? parsePluginSlots(node.content) : [];
}

function specialContribution(slotId: string, plugin: Plugin, file: PluginFile) {
  return (
    (slotId === "toolFunction" &&
      /^tools\/[^/]+\/prompt\.md$/i.test(file.path) &&
      plugin.files.some((candidate) =>
        candidate.path === file.path.replace(/prompt\.md$/i, "tool.js"),
      )) ||
    (slotId === "REGEX" && file.path === pluginConventions.regex)
  );
}

function slotResource(
  plugin: Plugin,
  file: PluginFile,
  packageId?: string,
): SlotResource {
  return {
    id: file.id,
    pluginId: plugin.id,
    pluginName: plugin.name,
    name: file.name,
    type: pluginFileType(file.name),
    path: file.path,
    worldPath: pluginWorldPath(plugin, file.path, packageId),
    order: file.order,
    condition: file.insertion?.condition,
    conditionPath: file.insertion?.conditionPath,
    file,
  };
}

function sortResources(resources: SlotResource[]) {
  resources.sort(
    (a, b) =>
      a.order - b.order ||
      a.pluginId.localeCompare(b.pluginId) ||
      a.id.localeCompare(b.id),
  );
  return resources;
}

export const useSlotStore = defineStore("plugin-slots", {
  actions: {
    listSlots(
      plugins: Plugin[] = usePluginStore().sortedPlugins,
      options: SlotWorldOptions = {},
    ): SlotQuery[] {
      const config = options.config ?? createWorldConfig();
      const locals = new Map(
        plugins.map((plugin) => [plugin.id, pluginSlotDefinitions(plugin)]),
      );
      const globalSlots: SlotQuery[] = config.slots.map(
        (definition) => {
          const allResources = sortResources(plugins.flatMap((plugin) =>
            plugin.files.flatMap((file) => {
              const insertionSlot = file.insertion?.slot;
              const direct = insertionSlot === definition.id || specialContribution(definition.id, plugin, file);
              if (!direct || !pluginFileMatchesSlotSuffix(file.name, definition.contentSuffixes))
                return [];
              return [slotResource(plugin, file, options.packageId)];
            }),
          ));
          const enabled = allResources.filter((resource) =>
            !isWorldPathDisabled(config, resource.worldPath));
          const selected = selectPluginSlotResources(
            definition,
            enabled,
          );
          return {
            ...definition,
            scope: "global" as const,
            pluginId: "",
            allResources,
            resources: selected,
          };
        },
      );
      const localSlots = plugins.flatMap((plugin) =>
        (locals.get(plugin.id) ?? []).map((slot) => {
          const allResources = sortResources(plugin.files.flatMap((file) =>
            file.insertion?.slot === slot.id &&
            pluginFileMatchesSlotSuffix(file.name, slot.contentSuffixes)
              ? [slotResource(plugin, file, options.packageId)]
              : [],
          ));
          const enabled = allResources.filter((resource) =>
            !isWorldPathDisabled(config, resource.worldPath));
          return {
            ...slot,
            scope: "local" as const,
            pluginId: plugin.id,
            pluginName: plugin.name,
            allResources,
            resources: selectPluginSlotResources(slot, enabled),
          };
        }),
      );
      return [...globalSlots, ...localSlots];
    },
    getSlot(
      id: string,
      scope?: "local" | "global",
      plugins?: Plugin[],
      options: SlotWorldOptions = {},
    ) {
      return this.listSlots(plugins, options).find(
        (slot) => slot.id === id &&
          (!scope || slot.scope === scope) &&
          (slot.scope === "global" || !options.sourcePluginId || slot.pluginId === options.sourcePluginId),
      ) ?? null;
    },
    api(
      plugins: Plugin[] = usePluginStore().sortedPlugins,
      options: SlotWorldOptions = {},
    ) {
      const list = (scope?: "local" | "global") =>
        this.listSlots(plugins, options).filter((slot) =>
          (!scope || slot.scope === scope) &&
          (slot.scope === "global" || !options.sourcePluginId || slot.pluginId === options.sourcePluginId),
        );
      const get = (id: string, scope?: "local" | "global") =>
        list(scope).find((slot) => slot.id === id) ?? null;
      const paths = (id: string, scope?: "local" | "global") =>
        (get(id, scope)?.resources ?? []).map((resource) =>
          options.packageId ? worldReference(resource.worldPath) : `@/${resource.path}`,
        );
      return { list, get, paths, import: paths };
    },
  },
});
