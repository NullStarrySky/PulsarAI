import { computed, type MaybeRefOrGetter, readonly, toValue } from "vue";
import {
	registerSyncHandler,
	useSyncStore,
} from "@/features/Database/dbsync-store";
import { importBuiltinPlugins } from "../utils/import-converter";
import { replayPluginData } from "./pulse";
import type { PluginData, ReplayGroups } from "./types";
import { type GlobalPluginData, useTreeMerge } from "./use-tree-merge";

const builtinPlugins = importBuiltinPlugins();

function findPlugin(pluginId: string): PluginData | undefined {
	return useSyncStore().plugins.get(pluginId) as PluginData | undefined;
}

registerSyncHandler<PluginData>("plugin", {
	table: "resource_worlds",
	recordId: (id) => `local:${id}`,
	value: findPlugin,
});

/** A thin reactive lookup of persisted source content; it never applies conversation Pulses. */
export function usePurePluginData(pluginId: MaybeRefOrGetter<string>) {
	return computed(() => findPlugin(toValue(pluginId)) ?? null);
}

/** Static built-ins are ordinary global source trees; callers may provide a different set later. */
export function useGlobalPluginData() {
	return computed<GlobalPluginData>(() => builtinPlugins);
}

/** The current conversation view: source content plus every active-version replay group. */
export function usePluginData(
	pluginId: MaybeRefOrGetter<string>,
	replayGroups: MaybeRefOrGetter<ReplayGroups>,
	globalPlugins: MaybeRefOrGetter<GlobalPluginData> = useGlobalPluginData(),
) {
	const source = usePurePluginData(pluginId);
	const merged = useTreeMerge(source, globalPlugins);
	return computed(() => {
		const value = merged.value;
		return value ? replayPluginData(value, toValue(replayGroups)) : null;
	});
}

export function useCharacterList() {
	const store = useSyncStore();
	const characters = computed(() => new Set(store.characters));
	return { characters: readonly(characters) };
}
