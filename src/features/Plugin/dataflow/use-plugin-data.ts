import { computed, type MaybeRefOrGetter, readonly, toValue } from "vue";
import {
	registerSyncHandler,
	useSyncStore,
} from "@/features/Database/dbsync-store";
import { parseCharacterDefinition } from "../resources/types/character/plugin-character";
import {
	createLocalPluginData,
	importBuiltinPlugins,
} from "../utils/import-converter";
import { parsePluginPath, replayPluginData } from "./pulse";
import type { PluginData, Pulse, ReplayGroups } from "./types";
import { type GlobalPluginData, mergePluginData } from "./use-tree-merge";

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

function routePulse(pulse: Pulse): { folder: string | null; pulse: Pulse } {
	if (pulse.kind === "node.move" || pulse.kind === "node.copy") {
		const from = parsePluginPath(pulse.from);
		const to = parsePluginPath(pulse.to);
		if (
			from.scope !== to.scope ||
			(from.scope === "global" &&
				to.scope === "global" &&
				from.folder !== to.folder)
		)
			throw new Error("一次 Pulse 不能跨 Plugin 来源移动或复制资源。");
		return {
			folder: from.scope === "global" ? from.folder : null,
			pulse: { ...pulse, from: from.path, to: to.path },
		};
	}
	const parsed = parsePluginPath(pulse.path);
	return {
		folder: parsed.scope === "global" ? parsed.folder : null,
		pulse: { ...pulse, path: parsed.path },
	};
}

/** Replays each source independently, then mounts only the role's enabled folders. */
export function replayAndMergePluginData(
	local: PluginData,
	global: GlobalPluginData,
	groups: ReplayGroups,
) {
	const localGroups: Pulse[][] = groups.map(() => []);
	const globalGroups = new Map<string, Pulse[][]>();
	groups.forEach((group, groupIndex) => {
		for (const pulse of group) {
			const routed = routePulse(pulse);
			if (routed.folder === null) localGroups[groupIndex]!.push(routed.pulse);
			else {
				let target = globalGroups.get(routed.folder);
				if (!target) {
					target = groups.map(() => []);
					globalGroups.set(routed.folder, target);
				}
				target[groupIndex]!.push(routed.pulse);
			}
		}
	});
	const replayedLocal = replayPluginData(local, localGroups);
	const enabled = parseCharacterDefinition(
		replayedLocal.tree["definition.package.json"],
	).globalPlugins;
	const replayedGlobal = Object.fromEntries(
		Object.entries(global).map(([folder, source]) => [
			folder,
			replayPluginData(
				source,
				globalGroups.get(folder) ?? groups.map(() => []),
			),
		]),
	) as GlobalPluginData;
	const selected: GlobalPluginData = {};
	for (const folder of enabled) {
		const source = replayedGlobal[folder];
		if (source) selected[folder] = source;
	}
	return mergePluginData(replayedLocal, selected);
}

/** The current conversation view: source content plus every active-version replay group. */
export function usePluginData(
	pluginId: MaybeRefOrGetter<string>,
	replayGroups: MaybeRefOrGetter<ReplayGroups>,
	globalPlugins: MaybeRefOrGetter<GlobalPluginData> = useGlobalPluginData(),
) {
	const source = usePurePluginData(pluginId);
	return computed(() => {
		const value = source.value;
		return value
			? replayAndMergePluginData(
					value,
					toValue(globalPlugins),
					toValue(replayGroups),
				)
			: null;
	});
}

export function useCharacterList() {
	const store = useSyncStore();
	const characters = computed(() => new Set(store.characters));

	async function create() {
		const id = crypto.randomUUID();
		store.addPlugin(id, createLocalPluginData(`local:${id}`));
		store.markDirty({ type: "plugin", id });
		await store._sync({ type: "plugin", id });
		return [...store.characters].find((character) => character.id === id)!;
	}

	async function importCharacter() {
		const { useBackupStore } = await import("@/features/Backup/backup-store");
		const id = await useBackupStore().importResourceArchive("update");
		return id
			? ([...store.characters].find((character) => character.id === id) ?? null)
			: null;
	}

	return {
		characters: readonly(characters),
		create,
		import: importCharacter,
	};
}
