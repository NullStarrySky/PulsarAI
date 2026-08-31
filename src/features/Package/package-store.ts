import { defineStore } from "pinia";
import { toRaw } from "vue";
import { remove, upsert } from "@/features/Database/database-service";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import { createWorldConfig } from "@/features/Plugin/tree/world-config";
import type { CharacterPackage, PackageCategory } from "./package-types";

export const packageTable = "resource_packages";
export const categoryTable = "resource_package_categories";

function comparePackages(a: CharacterPackage, b: CharacterPackage) {
  return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || a.order - b.order || a.name.localeCompare(b.name, "zh-Hans");
}

export const usePackageStore = defineStore("conversation-packages", {
  state: () => ({ packages: [] as CharacterPackage[], categories: [] as PackageCategory[] }),
  getters: {
    sortedPackages: (state) => [...state.packages].sort(comparePackages),
  },
  actions: {
    hydrate(packages: CharacterPackage[], categories: PackageCategory[]) {
      this.packages = packages.map((item) => ({ ...item, pluginId: item.pluginId ?? "", worldConfig: createWorldConfig(item.worldConfig), conversations: item.conversations ?? [] }));
      this.categories = categories;
    },
    async persist(item: CharacterPackage) { await upsert(packageTable, item.id, structuredClone(toRaw(item))); },
    async create(input: Partial<Pick<CharacterPackage, "name" | "icon" | "description">> = {}) {
      const item: CharacterPackage = { id: crypto.randomUUID(), name: input.name?.trim() || "新角色包", icon: input.icon ?? "", description: input.description, order: Math.max(-1, ...this.packages.map((value) => value.order)) + 1, conversations: [], pluginId: "", worldConfig: createWorldConfig() };
      this.packages.push(item);
      await this.persist(item);
      const plugins = usePluginStore();
      await plugins.initialize();
      item.pluginId = (await plugins.createPlugin(item.id)).id;
      await this.persist(item);
      return item;
    },
    async update(packageId: string, patch: Partial<Pick<CharacterPackage, "name" | "icon" | "description" | "pinned" | "worldConfig" | "syncEnabled">>) {
      const item = this.packages.find((value) => value.id === packageId);
      if (!item) return;
      Object.assign(item, patch);
      await this.persist(item);
    },
    async remove(packageId: string) {
      this.packages = this.packages.filter((item) => item.id !== packageId);
      await remove(packageTable, packageId);
    },
  },
});
