import { defineStore } from "pinia";
import { toRaw } from "vue";
import { remove, selectAll, upsert } from "@/features/Database/database-service";
import {
	ensurePackageWorldDocument,
	packageWorldDocumentId,
} from "@/features/Plugin/tree/world-persistence";
import { forgetPackageWorld } from "@/features/Plugin/tree/world-store";
import type { CharacterPackage, PackageCategory } from "./package-types";

export const packageTable = "resource_packages";
export const categoryTable = "resource_package_categories";

function comparePackages(a: CharacterPackage, b: CharacterPackage) {
	return (
		Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
		a.order - b.order ||
		a.name.localeCompare(b.name, "zh-Hans")
	);
}

export const usePackageStore = defineStore("conversation-packages", {
	state: () => ({
		packages: [] as CharacterPackage[],
		categories: [] as PackageCategory[],
		loaded: false,
	}),
	getters: {
		sortedPackages: (state) => [...state.packages].sort(comparePackages),
	},
	actions: {
		async initialize() {
			if (this.loaded) return;
			const [pkgRecords, catRecords] = await Promise.all([
				selectAll<CharacterPackage>(packageTable),
				selectAll<PackageCategory>(categoryTable),
			]);
			this.packages = pkgRecords.map((r) => r.value);
			this.categories = catRecords.map((r) => r.value);
			if (this.packages.length === 0) {
				await this.create({ name: "默认角色包" });
			}
			this.loaded = true;
		},
		hydrate(packages: CharacterPackage[], categories: PackageCategory[]) {
			this.packages = packages;
			this.categories = categories;
			this.loaded = true;
		},
		async persist(item: CharacterPackage) {
			await upsert(packageTable, item.id, structuredClone(toRaw(item)));
		},
		async create(
			input: Partial<
				Pick<CharacterPackage, "name" | "icon" | "description">
			> = {},
		) {
			const item: CharacterPackage = {
				id: crypto.randomUUID(),
				name: input.name?.trim() || "新角色包",
				icon: input.icon ?? "",
				description: input.description,
				order: Math.max(-1, ...this.packages.map((value) => value.order)) + 1,
			};
			this.packages.push(item);
			await this.persist(item);
			await ensurePackageWorldDocument(item.id);
			return item;
		},
		async update(
			packageId: string,
			patch: Partial<
				Pick<
					CharacterPackage,
					"name" | "icon" | "description" | "pinned" | "syncEnabled" | "categoryId" | "nickname"
				>
			>,
		) {
			const item = this.packages.find((value) => value.id === packageId);
			if (!item) return;
			Object.assign(item, patch);
			await this.persist(item);
		},
		async renamePackage(packageId: string, name: string) {
			await this.update(packageId, { name });
		},
		async setPackagePinned(packageId: string, pinned: boolean) {
			await this.update(packageId, { pinned });
		},
		async setPackageDescription(packageId: string, description: string) {
			await this.update(packageId, { description });
		},
		async setPackageIcon(packageId: string, icon: string) {
			await this.update(packageId, { icon });
		},
		async remove(packageId: string) {
			this.packages = this.packages.filter((item) => item.id !== packageId);
			await remove(packageTable, packageId);
			await remove("resource_worlds", packageWorldDocumentId(packageId));
			forgetPackageWorld(packageId);
		},
	},
});
