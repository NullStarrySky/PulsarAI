import { computed, readonly } from "vue";
import { registerSyncHandler, useSyncStore } from "@/features/Database/dbsync-store";
import type { PluginData } from "./types";

function findPlugin(pluginId: string): PluginData | undefined {
	return useSyncStore().plugins.get(pluginId) as PluginData | undefined;
}

registerSyncHandler<PluginData>("plugin", {
	table: "resource_worlds",
	recordId: id => `local:${id}`,
	value: findPlugin,
});

/** Role projection only. It deliberately has no write strategy yet. */
export function useCharacterList() {
	const store = useSyncStore();
	const characters = computed(() => new Set(store.characters));
	// TODO: Character writes move here after World persistence joins dbsync.
	return { characters: readonly(characters) };
}

export function usePluginData(pluginId: string) {
	return computed(() => findPlugin(pluginId) ?? null);
}
