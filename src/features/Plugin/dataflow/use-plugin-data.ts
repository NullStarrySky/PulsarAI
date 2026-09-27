import {
	computed,
	type MaybeRefOrGetter,
	reactive,
	readonly,
	toValue,
	watch,
} from "vue";
import {
	isPluginVersionUsed,
	removeConversation,
} from "@/features/Conversation/dataflow/conversations";
import { useSyncStore } from "@/features/Database/dbsync-store";
import {
	type CharacterData,
	characterFromPlugin,
	parseCharacterDefinition,
} from "../resources/types/character/plugin-character";

export type { CharacterData };

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
import { applyPulse } from "./pulse";
import type { PluginData, PluginDocument, Pulse, ReplayGroups } from "./types";
import {
	type GlobalPluginData,
	replayAndMergePluginData,
} from "./use-tree-merge";

const builtinPlugins = importBuiltinPlugins();
export function refreshCharacter(id: CharacterData["id"]) {
	const store = useSyncStore();
	const plugin = findPlugin(id);
	if (!plugin) return;
	const version = latestPluginVersion(plugin);
	if (!version) throw new Error(`Plugin 没有可加载的版本：${id}`);
	const next = characterFromPlugin(id, replayPluginVersion(plugin, version.id));
	const current = store.characters.get(id);
	if (
		current?.name === next.name &&
		current.description === next.description &&
		current.avatarUrl === next.avatarUrl &&
		current.coverUrl === next.coverUrl
	)
		return;
	store.characters.set(id, next);
	store.markDirty({ type: "character", id });
}

function findPlugin(pluginId: string): PluginDocument | undefined {
	return useSyncStore().plugins.get(pluginId) as PluginDocument | undefined;
}

async function loadPluginEnvironment(pluginId: string) {
	if (!pluginId) return;
	const store = useSyncStore();
	if (!findPlugin(pluginId)) await store.load({ type: "plugin", id: pluginId });
	await store.load({ type: "conversationList", id: pluginId });
}

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

/** The current conversation view. `loadEnvironment` also loads the Plugin's bound conversation metadata. */
export function usePluginData(
	pluginId: MaybeRefOrGetter<string>,
	replayGroups: MaybeRefOrGetter<ReplayGroups>,
	versionId?: MaybeRefOrGetter<string | undefined>,
	loadEnvironment = false,
	globalPlugins: MaybeRefOrGetter<GlobalPluginData> = useGlobalPluginData(),
) {
	if (loadEnvironment)
		watch(
			() => toValue(pluginId),
			(id) => void loadPluginEnvironment(id),
			{ immediate: true },
		);
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
	if (isPluginVersionUsed(id, version.id))
		plugin.versions.push(createPluginVersion(plugin, [pulse]));
	else appendPluginVersion(plugin, version, pulse);
	store.markDirty({ type: "plugin", id });
	refreshCharacter(id);
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
	const characters = computed(() => new Set(store.characters.values()));

	async function create() {
		await store.init();
		const id = crypto.randomUUID();
		const source = createLocalPluginData(`local:${id}`);
		const document = preparePluginDocument(source);
		store.plugins.set(id, reactive(document) as PluginDocument);
		store.markDirty({ type: "plugin", id });
		refreshCharacter(id);
		await store._sync();
		return store.characters.get(id)!;
	}

	async function remove(id: CharacterData["id"]) {
		await store.init();
		await store.load({ type: "conversationList", id });
		const metaMap = store.conversationMeta.get(id);
		if (metaMap) {
			for (const convId of Array.from(metaMap.keys())) {
				await store.load({ type: "conversation", id: convId });
				removeConversation(convId);
			}
			store.conversationMeta.delete(id);
		}
		if (!store.characters.has(id)) return;
		store.plugins.delete(id);
		store.markDirty({ type: "plugin", id });
		store.characters.delete(id);
		store.markDirty({ type: "character", id });
		await store._sync();
	}

	async function rename(id: CharacterData["id"], name: string) {
		await store.init();
		let plugin = findPlugin(id);
		if (!plugin) {
			await store.load({ type: "plugin", id });
			plugin = findPlugin(id);
		}
		if (!plugin) throw new Error(`找不到角色数据：${id}`);
		const version = latestPluginVersion(plugin);
		if (!version) throw new Error(`角色没有可编辑的版本：${id}`);
		const replayed = replayPluginVersion(plugin, version.id);
		const defRaw = replayed.tree["definition.package.json"];
		const parsed = parseCharacterDefinition(defRaw);
		parsed.name = name.trim() || "未命名角色";
		const pulse: Pulse = {
			kind: "file.write",
			path: "/definition.package.json",
			content: JSON.stringify(parsed, null, 2),
		};
		applyPluginPulse(id, pulse);
		await store._sync();
	}

	return {
		characters: readonly(characters),
		create,
		remove,
		rename,
	};
}
