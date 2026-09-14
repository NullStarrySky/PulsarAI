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
import {
	appendPluginVersion,
	createPluginVersion,
	latestPluginVersion,
	preparePluginDocument,
	replayPluginVersion,
	usePluginVersion,
} from "./plugin-version";
import { applyPulse, parsePluginPath, replayPluginData } from "./pulse";
import type { PluginData, PluginDocument, Pulse, ReplayGroups } from "./types";
import { type GlobalPluginData, mergePluginData } from "./use-tree-merge";

const builtinPlugins = importBuiltinPlugins();

function findPlugin(pluginId: string): PluginDocument | undefined {
	return useSyncStore().plugins.get(pluginId) as PluginDocument | undefined;
}

registerSyncHandler<PluginDocument>("plugin", {
	table: "resource_worlds",
	value: findPlugin,
	recordId: (id) => `local:${id}`,
});

/** Replays one saved version, plus unsaved edits only when no version is pinned. */
export function usePurePluginData(
	pluginId: MaybeRefOrGetter<string>,
	versionId?: MaybeRefOrGetter<string | undefined>,
) {
	const selectedVersion = usePluginVersion(pluginId, versionId);
	return computed(() => {
		const id = toValue(pluginId);
		const document = findPlugin(id);
		if (!document) return null;
		const requestedVersion = versionId ? toValue(versionId) : undefined;
		const version = selectedVersion.value;
		if (!version)
			throw new Error(
				requestedVersion !== undefined
					? `Plugin 版本不存在：${requestedVersion}`
					: `Plugin 没有可加载的版本：${id}`,
			);
		return replayPluginVersion(document, version.id);
	});
}

/** Static built-ins are ordinary global source trees; callers may provide a different set later. */
function useGlobalPluginData() {
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

/** Replays and mounts every source, including inactive sources visible to resource UI. */
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
	const replayedGlobal: GlobalPluginData = {};
	for (const [folder, source] of Object.entries(global))
		Object.defineProperty(replayedGlobal, folder, {
			value: replayPluginData(source, globalGroups.get(folder) ?? []),
			enumerable: true,
		});
	return mergePluginData(replayedLocal, replayedGlobal);
}

/** Read-only active projection over the same replay result; no subtree or meta cloning. */
export function useActivePluginData(
	filetree: MaybeRefOrGetter<PluginData | null>,
) {
	return computed<PluginData | null>(() => {
		const data = toValue(filetree);
		if (!data) return null;
		const enabled = parseCharacterDefinition(
			data.tree["definition.package.json"],
		).globalPlugins;
		const global = data.tree.global;
		const enabledSet = new Set(enabled);
		return {
			id: data.id,
			tree: {
				...data.tree,
				global: Object.fromEntries(
					enabled.flatMap((folder) =>
						global &&
						typeof global !== "string" &&
						Object.hasOwn(global, folder)
							? [[folder, global[folder]!]]
							: [],
					),
				),
			},
			meta: Object.fromEntries(
				Object.entries(data.meta).filter(
					([path]) =>
						!path.startsWith("/global/") || enabledSet.has(path.split("/")[2]!),
				),
			),
		};
	});
}

/** The current conversation view: source content plus every active-version replay group. */
export function usePluginData(
	pluginId: MaybeRefOrGetter<string>,
	replayGroups: MaybeRefOrGetter<ReplayGroups>,
	versionId?: MaybeRefOrGetter<string | undefined>,
	globalPlugins: MaybeRefOrGetter<GlobalPluginData> = useGlobalPluginData(),
) {
	const source = usePurePluginData(pluginId, versionId);
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

function applyPluginPulse(id: string, pulse: Pulse) {
	const store = useSyncStore();
	const plugin = findPlugin(id);
	if (!plugin) throw new Error(`Plugin 尚未加载：${id}`);
	const version = latestPluginVersion(plugin);
	if (!version) throw new Error(`Plugin 没有可编辑的版本：${id}`);
	applyPulse(replayPluginVersion(plugin, version.id), pulse);
	if (store.isPluginVersionUsed(id, version.id))
		plugin.versions.push(createPluginVersion(plugin, [pulse]));
	else appendPluginVersion(version, pulse);
	store.markDirty({ type: "plugin", id });
	store.refreshCharacter(id);
}

/** Editable source-local latest-version projection. Every edit updates the head version. */
export function useEditablePluginData(pluginId: MaybeRefOrGetter<string>) {
	const filetree = usePurePluginData(pluginId);
	return {
		filetree,
		applyPulse: (pulse: Pulse) => applyPluginPulse(toValue(pluginId), pulse),
	};
}

export function useCharacterList() {
	const store = useSyncStore();
	const characters = computed(() => new Set(store.characters));

	async function create() {
		const id = crypto.randomUUID();
		const source = createLocalPluginData(`local:${id}`);
		const document = preparePluginDocument(source);
		store.addPlugin(id, document);
		await store._sync({ type: "plugin", id });
		return [...store.characters].find((character) => character.id === id)!;
	}

	async function importCharacter() {
		const { useBackupStore } = await import(
			"@/features/Environment/backup/backup-store"
		);
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
