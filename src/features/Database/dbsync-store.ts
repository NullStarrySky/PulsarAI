import { acceptHMRUpdate, defineStore } from "pinia";
import { reactive, shallowReactive } from "vue";
import type {
	ChatContainer,
	ChatMeta,
} from "@/features/Conversation/dataflow/types";
import {
	latestPluginVersion,
	replayPluginVersion,
} from "@/features/Plugin/dataflow/plugin-version";
import type { PluginDocument } from "@/features/Plugin/dataflow/types";
import {
	type CharacterData,
	characterFromPlugin,
} from "@/features/Plugin/resources/types/character/plugin-character";
import {
	remove,
	selectAll,
	selectByField,
	selectOne,
	upsert,
} from "./database-service";

export type SyncTarget =
	| { type: "chatList"; id: string }
	| { type: "chat"; id: string };
export type DirtyTarget =
	| { type: "meta"; id: string }
	| { type: "container"; id: string }
	| { type: "plugin"; id: string };
export type SyncKind = DirtyTarget["type"];

export interface SyncHandler<TMemory, TPersisted = TMemory> {
	table: string;
	value(id: string): TMemory | undefined;
	recordId?: (id: string) => string;
	/** Maps runtime state to its persisted form; omit it for an identity write. */
	serialize?: (value: TMemory) => TPersisted;
}

const handlers = new Map<SyncKind, SyncHandler<unknown, unknown>>();

/** Feature-owned record mappings. The store only batches and owns memory. */
export function registerSyncHandler<TMemory, TPersisted = TMemory>(
	kind: SyncKind,
	handler: SyncHandler<TMemory, TPersisted>,
) {
	handlers.set(kind, handler as unknown as SyncHandler<unknown, unknown>);
}

function dirtyKey(target: DirtyTarget) {
	return `${target.type}:${target.id}`;
}

function parseDirtyKey(key: string): DirtyTarget {
	const index = key.indexOf(":");
	return { type: key.slice(0, index) as SyncKind, id: key.slice(index + 1) };
}

/**
 * The only in-memory source for conversation data. Features mutate these
 * collections; feature actions mark persistent changes dirty for batched writes.
 */
export const useSyncStore = defineStore("dbsync", () => {
	const characters = reactive(new Set<CharacterData>());
	const plugins = reactive(new Map<string, PluginDocument>());
	const chatMeta = shallowReactive(new Map<string, Map<string, ChatMeta>>());
	const containers = shallowReactive(
		new Map<string, Map<string, ChatContainer>>(),
	);
	const chatPluginVersions = new Map<
		string,
		{ pluginId: string; versionId: string }
	>();
	const pluginVersionUses = new Map<string, Map<string, number>>();
	const dirty = new Set<string>();
	const loadedChatLists = new Set<string>();
	const loadedChats = new Set<string>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let initialized = false;
	let hydrating = 0;

	function schedule() {
		if (timer) return;
		timer = setTimeout(() => {
			timer = undefined;
			void _sync();
		}, 500);
	}

	function markDirty(target: DirtyTarget) {
		if (hydrating) return;
		const key = dirtyKey(target);
		dirty.add(key);
		schedule();
	}

	function trackChatPluginVersion(value: ChatMeta) {
		const previous = chatPluginVersions.get(value.id);
		if (
			previous?.pluginId === value.localPluginId &&
			previous.versionId === value.pluginVersionId
		)
			return;
		if (previous) {
			const versions = pluginVersionUses.get(previous.pluginId)!;
			const count = versions.get(previous.versionId)! - 1;
			if (count) versions.set(previous.versionId, count);
			else versions.delete(previous.versionId);
		}
		chatPluginVersions.set(value.id, {
			pluginId: value.localPluginId,
			versionId: value.pluginVersionId,
		});
		const versions = pluginVersionUses.get(value.localPluginId) ?? new Map();
		pluginVersionUses.set(value.localPluginId, versions);
		versions.set(
			value.pluginVersionId,
			(versions.get(value.pluginVersionId) ?? 0) + 1,
		);
	}

	function untrackChatPluginVersion(chatId: string) {
		const previous = chatPluginVersions.get(chatId);
		if (!previous) return;
		chatPluginVersions.delete(chatId);
		const versions = pluginVersionUses.get(previous.pluginId)!;
		const count = versions.get(previous.versionId)! - 1;
		if (count) versions.set(previous.versionId, count);
		else versions.delete(previous.versionId);
	}

	function isPluginVersionUsed(pluginId: string, versionId: string) {
		return (pluginVersionUses.get(pluginId)?.get(versionId) ?? 0) > 0;
	}

	function addChat(value: ChatMeta) {
		trackChatPluginVersion(value);
		let list = chatMeta.get(value.localPluginId);
		if (!list) {
			list = shallowReactive(new Map<string, ChatMeta>());
			chatMeta.set(value.localPluginId, list);
		}
		const chat = reactive(value) as ChatMeta;
		list.set(value.id, chat);
		return chat;
	}

	function addContainers(chatId: string, values: ChatContainer[]) {
		const list = shallowReactive(
			new Map<string, ChatContainer>(
				values.map((value) => [value.id, reactive(value) as ChatContainer]),
			),
		);
		containers.set(chatId, list);
		return list;
	}

	function addContainer(value: ChatContainer) {
		let list = containers.get(value.conversationid);
		if (!list) list = addContainers(value.conversationid, []);
		const container = reactive(value) as ChatContainer;
		list.set(value.id, container);
		return container;
	}

	function refreshCharacter(id: string) {
		const current = [...characters].find((item) => item.id === id);
		const plugin = plugins.get(id);
		if (!plugin) {
			if (current) characters.delete(current);
			return;
		}
		const version = latestPluginVersion(plugin);
		if (!version) throw new Error(`Plugin 没有可加载的版本：${id}`);
		const next = characterFromPlugin(
			id,
			replayPluginVersion(plugin, version.id),
		);
		if (current) Object.assign(current, next);
		else characters.add(next);
	}

	function addPlugin(id: string, value: PluginDocument) {
		const plugin = reactive(value) as PluginDocument;
		plugins.set(id, plugin);
		refreshCharacter(id);
		markDirty({ type: "plugin", id });
		return plugin;
	}

	/** Removes one chat's memory graph after queuing database deletes. */
	function removeChat(chatId: string) {
		const chat = [...chatMeta.values()]
			.map((list) => list.get(chatId))
			.find(Boolean);
		for (const container of containers.get(chatId)?.values() ?? [])
			markDirty({ type: "container", id: container.id });
		if (chat) markDirty({ type: "meta", id: chat.id });
		containers.delete(chatId);
		if (chat) {
			untrackChatPluginVersion(chat.id);
			chatMeta.get(chat.localPluginId)?.delete(chat.id);
		}
		loadedChats.delete(chatId);
	}

	async function init() {
		if (initialized) return;
		initialized = true;
		hydrating++;
		try {
			const [plugins, chats] = await Promise.all([
				selectAll<PluginDocument>("resource_worlds"),
				selectAll<ChatMeta>("conversations"),
			]);
			for (const row of plugins) {
				const value = row.value;
				if (!value.id?.startsWith("local:")) continue;
				const id = value.id.slice("local:".length);
				addPlugin(id, value);
			}
			for (const row of chats)
				if (row.value.localPluginId && row.value.pluginVersionId)
					trackChatPluginVersion(row.value);
		} finally {
			hydrating--;
		}
	}

	async function load(target: SyncTarget) {
		if (target.type === "chatList") {
			if (loadedChatLists.has(target.id)) return;
			loadedChatLists.add(target.id);
			hydrating++;
			try {
				const rows = await selectByField<ChatMeta>(
					"conversations",
					"localPluginId",
					target.id,
				);
				for (const row of rows) addChat(row.value);
			} finally {
				hydrating--;
			}
			return;
		}
		if (loadedChats.has(target.id)) return;
		loadedChats.add(target.id);
		hydrating++;
		try {
			const known = [...chatMeta.values()]
				.map((list) => list.get(target.id))
				.find(Boolean);
			const chat =
				known ?? (await selectOne<ChatMeta>("conversations", target.id));
			if (!chat) return;
			if (![...chatMeta.values()].some((list) => list.has(chat.id)))
				addChat(chat);
			if (containers.has(target.id)) return;
			const rows = await selectByField<ChatContainer>(
				"message_containers",
				"conversationid",
				target.id,
			);
			addContainers(
				target.id,
				rows.map((row) => row.value),
			);
		} finally {
			hydrating--;
		}
	}

	async function syncTarget(target: DirtyTarget) {
		const key = dirtyKey(target);
		if (!dirty.has(key)) return;
		const handler = handlers.get(target.type);
		if (!handler) throw new Error(`syncStore 缺少 ${target.type} 的同步实现。`);
		const recordId = handler.recordId?.(target.id) ?? target.id;
		const value = handler.value(target.id);
		if (value === undefined) await remove(handler.table, recordId);
		else
			await upsert(
				handler.table,
				recordId,
				handler.serialize?.(value) ?? value,
			);
		dirty.delete(key);
	}

	async function _sync(target?: DirtyTarget) {
		if (timer) {
			clearTimeout(timer);
			timer = undefined;
		}
		const entries = target ? [target] : [...dirty].map(parseDirtyKey);
		for (const entry of entries) await syncTarget(entry);
	}

	async function unload(target: SyncTarget) {
		if (target.type === "chatList") {
			if (!loadedChatLists.delete(target.id)) return;
			const list = chatMeta.get(target.id);
			for (const chat of [...(list?.values() ?? [])] as Array<{ id: string }>) {
				const id = (chat as { id: string }).id;
				if (loadedChats.has(id)) continue;
				await _sync({ type: "meta", id });
				list?.delete(id);
			}
			return;
		}
		if (!loadedChats.delete(target.id)) return;
		await _sync();
		const chat = [...chatMeta.values()]
			.map((list) => list.get(target.id))
			.find(Boolean);
		if (chat) await _sync({ type: "meta", id: chat.id });
		for (const item of containers.get(target.id)?.values() ?? [])
			await _sync({ type: "container", id: item.id });
		containers.delete(target.id);
		if (chat && !loadedChatLists.has(chat.localPluginId)) {
			chatMeta.get(chat.localPluginId)?.delete(chat.id);
		}
	}

	/** Drop cached records. Scoped use functions own their watchers. */
	function clearAll() {
		if (timer) clearTimeout(timer);
		timer = undefined;
		characters.clear();
		plugins.clear();
		chatPluginVersions.clear();
		pluginVersionUses.clear();
		chatMeta.clear();
		containers.clear();
		dirty.clear();
		loadedChatLists.clear();
		loadedChats.clear();
		initialized = false;
	}

	return {
		characters,
		plugins,
		chatMeta,
		containers,
		init,
		load,
		unload,
		markDirty,
		_sync,
		clearAll,
		addChat,
		addPlugin,
		refreshCharacter,
		isPluginVersionUsed,
		trackChatPluginVersion,
		removeChat,
		addContainers,
		addContainer,
	};
});

if (import.meta.hot)
	import.meta.hot.accept(acceptHMRUpdate(useSyncStore, import.meta.hot));
