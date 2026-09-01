import { selectAll } from "@/features/Database/database-service";
import {
	categoryTable,
	packageTable,
	usePackageStore,
} from "@/features/Package/package-store";
import type {
	CharacterPackage,
	PackageCategory,
} from "./messages/conversation-types";

let loadPromise: Promise<void> | null = null;
let loaded = false;

export async function initializeConversation() {
	if (loaded) return;
	if (!loadPromise) loadPromise = load();
	await loadPromise;
}

async function load() {
	const [packages, categories] = await Promise.all([
		selectAll<CharacterPackage>(packageTable),
		selectAll<PackageCategory>(categoryTable),
	]);
	const packageStore = usePackageStore();
	packageStore.hydrate(
		packages.map((item) => item.value),
		categories.map((item) => item.value),
	);
	if (packageStore.packages.length === 0) await packageStore.create();
	loaded = true;
}
