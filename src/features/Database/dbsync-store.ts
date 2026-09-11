import { defineStore } from "pinia";
import { reactive, type WatchStopHandle, watch } from "vue";
import type {
	CharacterData,
	ChatContainer,
	ChatMeta,
} from "@/features/Conversation/dataflow/types";
import type { PluginData } from "@/features/Plugin/dataflow";
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
 * collections, watchers mark them dirty, and this store writes batches later.
 */
export const useSyncStore = defineStore("dbsync", () => {
	const characters = reactive(new Set<CharacterData>());
	const plugins = reactive(new Map<string, PluginData>());
	const chatMeta = reactive(new Map<string, Map<string, ChatMeta>>());
	const containers = reactive(new Map<string, Set<ChatContainer>>());
	const characterWatchers = new Map<string, WatchStopHandle>();
	const metaWatchers = new Map<string, WatchStopHandle>();
	const containerWatchers = new Map<string, WatchStopHandle>();
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

	function watchMeta(_pluginId: string, chatId: string, value: ChatMeta) {
		const key = `meta:${chatId}`;
		metaWatchers.get(key)?.();
		// Keep runtime-only generation progress out of both the record and dirty queue.
		metaWatchers.set(
			key,
			watch(
				() => ({
					id: value.id,
					localPluginId: value.localPluginId,
					title: value.title,
					rootContainerId: value.rootContainerId,
					lastContainerId: value.lastContainerId,
					lastMessagePreview: value.lastMessagePreview,
					composerDraft: value.composerDraft,
					createdAt: value.createdAt,
					updatedAt: value.updatedAt,
					lifetime: value.lifetime,
					pinned: value.pinned,
					isTemplate: value.isTemplate,
				}),
				() => markDirty({ type: "meta", id: chatId }),
				{ deep: true },
			),
		);
	}

	function watchContainers(chatId: string, value: Set<ChatContainer>) {
		const key = `container:${chatId}`;
		containerWatchers.get(key)?.();
		containerWatchers.set(
			key,
			watch(
				value,
				() => {
					for (const item of value as Set<{ id?: string }>)
						if (item.id) markDirty({ type: "container", id: item.id });
				},
				{ deep: true },
			),
		);
	}

	function addChat(value: ChatMeta) {
		let list = chatMeta.get(value.localPluginId);
		if (!list) {
			list = reactive(new Map<string, ChatMeta>());
			chatMeta.set(value.localPluginId, list);
		}
		list.set(value.id, reactive(value) as ChatMeta);
		watchMeta(value.localPluginId, value.id, list.get(value.id));
		return list.get(value.id)!;
	}

	function addContainers(chatId: string, values: ChatContainer[]) {
		const list = reactive(
			new Set<ChatContainer>(
				values.map((value) => reactive(value) as ChatContainer),
			),
		);
		containers.set(chatId, list);
		watchContainers(chatId, list);
		return list;
	}

	function addContainer(value: ChatContainer) {
		let list = containers.get(value.conversationid);
		if (!list) list = addContainers(value.conversationid, []);
		list.add(reactive(value) as ChatContainer);
		return [...list].find((item) => item.id === value.id)!;
	}

	/** Removes one chat's memory graph after queuing database deletes. */
	function removeChat(chatId: string) {
		const chat = [...chatMeta.values()]
			.map((list) => list.get(chatId))
			.find(Boolean);
		for (const container of containers.get(chatId) ?? [])
			markDirty({ type: "container", id: container.id });
		if (chat) markDirty({ type: "meta", id: chat.id });
		containerWatchers.get(`container:${chatId}`)?.();
		containerWatchers.delete(`container:${chatId}`);
		containers.delete(chatId);
		if (chat) {
			metaWatchers.get(`meta:${chat.id}`)?.();
			metaWatchers.delete(`meta:${chat.id}`);
			chatMeta.get(chat.localPluginId)?.delete(chat.id);
		}
		loadedChats.delete(chatId);
	}

	async function init() {
		if (initialized) return;
		initialized = true;
		hydrating++;
		try {
			const rows = await selectAll<PluginData>("resource_worlds");
			for (const row of rows) {
				const value = row.value;
				if (!value.id?.startsWith("local:")) continue;
				const id = value.id.slice("local:".length);
				plugins.set(id, reactive(value) as PluginData);
				// TODO: character projections are read-only until World persistence joins syncStore.
				const definitionSource = value.tree?.["definition.package.json"];
				let definition: Partial<CharacterData> | undefined;
				if (typeof definitionSource === "string") {
					try {
						definition = JSON.parse(definitionSource) as Partial<CharacterData>;
					} catch {
						definition = undefined;
					}
				}
				characters.add({
					id,
					name: definition?.name?.trim() || "未命名角色",
					description: definition?.description,
					avatarUrl: definition?.avatar,
					coverUrl: definition?.cover,
				});
				characterWatchers.set(
					id,
					watch(
						() => plugins.get(id),
						() => markDirty({ type: "plugin", id }),
						{ deep: true },
					),
				);
			}
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
				metaWatchers.get(`meta:${id}`)?.();
				metaWatchers.delete(`meta:${id}`);
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
		for (const item of (containers.get(target.id) as Set<{ id: string }>) ?? [])
			await _sync({ type: "container", id: item.id });
		containerWatchers.get(`container:${target.id}`)?.();
		containerWatchers.delete(`container:${target.id}`);
		containers.delete(target.id);
		if (chat && !loadedChatLists.has(chat.localPluginId)) {
			metaWatchers.get(`meta:${target.id}`)?.();
			metaWatchers.delete(`meta:${target.id}`);
			chatMeta.get(chat.localPluginId)?.delete(chat.id);
		}
	}

	/** Drop every cached record and its watchers. Persistent records are untouched. */
	function clearAll() {
		if (timer) clearTimeout(timer);
		timer = undefined;
		for (const stop of characterWatchers.values()) stop();
		for (const stop of metaWatchers.values()) stop();
		for (const stop of containerWatchers.values()) stop();
		characterWatchers.clear();
		metaWatchers.clear();
		containerWatchers.clear();
		characters.clear();
		plugins.clear();
		chatMeta.clear();
		containers.clear();
		dirty.clear();
		loadedChatLists.clear();
		loadedChats.clear();
		initialized = false;
	}

	return {
		characters,
		characterWatchers,
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
		removeChat,
		addContainers,
		addContainer,
	};
});
