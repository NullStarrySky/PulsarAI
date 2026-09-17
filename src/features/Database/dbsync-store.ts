import { defineStore } from "pinia";
import { reactive, shallowReactive } from "vue";
import type {
	ConversationContainer,
	ConversationMeta,
} from "@/features/Conversation/dataflow/types";
import type { PluginDocument } from "@/features/Plugin/dataflow/types";
import type { CharacterData } from "@/features/Plugin/resources/types/character/plugin-character";
import { host } from "@/host";

export type DirtyTarget =
	| { type: "meta"; id: ConversationMeta["id"] }
	| { type: "container"; id: ConversationContainer["id"] }
	| { type: "plugin"; id: CharacterData["id"] }
	| { type: "character"; id: CharacterData["id"] };
export type SyncKind = DirtyTarget["type"];
export type SyncTarget =
	| { type: "conversationList"; id: ConversationMeta["localPluginId"] }
	| { type: "conversation"; id: ConversationMeta["id"] }
	| { type: "plugin"; id: CharacterData["id"] }
	| { type: "conversationVersionIndex" };

export interface SyncHandler<TMemory, TPersisted = TMemory> {
	table: string;
	value(id: string): TMemory | undefined;
	recordId?: (id: string) => string;
	serialize?: (value: TMemory) => TPersisted;
	hydrate?: (value: TMemory) => void;
}

const handlers = new Map<SyncKind, SyncHandler<unknown, unknown>>();

export function registerSyncHandler<TMemory, TPersisted = TMemory>(
	kind: SyncKind,
	handler: SyncHandler<TMemory, TPersisted>,
) {
	handlers.set(kind, handler as SyncHandler<unknown, unknown>);
}

function dirtyKey(target: DirtyTarget) {
	return `${target.type}:${target.id}`;
}

function parseDirtyKey(key: string): DirtyTarget {
	const index = key.indexOf(":");
	return { type: key.slice(0, index) as SyncKind, id: key.slice(index + 1) };
}

/** Shared record containers and batched persistence. Feature code owns mutations. */
export const useSyncStore = defineStore("dbsync", () => {
	const plugins = shallowReactive(
		new Map<CharacterData["id"], PluginDocument>(),
	);
	const characters = shallowReactive(
		new Map<CharacterData["id"], CharacterData>(),
	);
	const conversationMeta = shallowReactive(
		new Map<
			ConversationMeta["localPluginId"],
			Map<ConversationMeta["id"], ConversationMeta>
		>(),
	);
	const containers = shallowReactive(
		new Map<
			ConversationMeta["id"],
			Map<ConversationContainer["id"], ConversationContainer>
		>(),
	);
	const dirty = new Set<string>();
	const loadedConversationLists = new Set<ConversationMeta["localPluginId"]>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pendingFlush = Promise.resolve();
	let initPromise: Promise<void> | undefined;
	let initGeneration = 0;

	function init() {
		const generation = initGeneration;
		return (initPromise ??= host.database
			.selectAll<CharacterData>("resource_characters")
			.then((rows) => {
				if (generation !== initGeneration) return;
				for (const { value } of rows)
					if (!characters.has(value.id)) characters.set(value.id, value);
			})
			.catch((error) => {
				initPromise = undefined;
				throw error;
			}));
	}

	function markDirty(target: DirtyTarget) {
		dirty.add(dirtyKey(target));
		if (timer) return;
		timer = setTimeout(() => {
			timer = undefined;
			void _sync();
		}, 500);
	}

	async function syncTarget(target: DirtyTarget) {
		const key = dirtyKey(target);
		if (!dirty.has(key)) return;
		const handler = handlers.get(target.type);
		if (!handler) throw new Error(`syncStore 缺少 ${target.type} 的同步实现。`);
		const recordId = handler.recordId?.(target.id) ?? target.id;
		const value = handler.value(target.id);
		dirty.delete(key);
		try {
			if (value === undefined)
				await host.database.remove(handler.table, recordId);
			else
				await host.database.upsert(
					handler.table,
					recordId,
					JSON.parse(JSON.stringify(handler.serialize?.(value) ?? value)),
				);
		} catch (error) {
			dirty.add(key);
			throw error;
		}
	}

	function _sync(target?: DirtyTarget) {
		if (timer) clearTimeout(timer);
		timer = undefined;
		const flush = pendingFlush.then(async () => {
			for (const entry of target ? [target] : [...dirty].map(parseDirtyKey))
				await syncTarget(entry);
		});
		pendingFlush = flush.catch(() => {});
		return flush;
	}

	function load(target: {
		type: "conversationVersionIndex";
	}): Promise<Array<{ id: string | null; value: ConversationMeta }>>;
	function load(
		target: Exclude<SyncTarget, { type: "conversationVersionIndex" }>,
	): Promise<undefined>;
	async function load(
		target: SyncTarget,
	): Promise<
		undefined | Array<{ id: string | null; value: ConversationMeta }>
	> {
		if (target.type === "conversationVersionIndex")
			return host.database.selectAll<ConversationMeta>("conversations");
		if (target.type === "plugin") {
			if (plugins.has(target.id)) return;
			const value = await host.database.selectOne<PluginDocument>(
				"resource_worlds",
				`local:${target.id}`,
			);
			if (!value) throw new Error(`Plugin 不存在：${target.id}`);
			plugins.set(target.id, reactive(value) as PluginDocument);
			return;
		}
		if (!handlers.get("meta")?.hydrate)
			await import("@/features/Conversation/dataflow/conversations");
		if (target.type === "conversationList") {
			if (loadedConversationLists.has(target.id)) return;
			const hydrate = handlers.get("meta")?.hydrate;
			if (!hydrate) throw new Error("syncStore 缺少 meta 的加载实现。");
			const rows = await host.database.selectByField<ConversationMeta>(
				"conversations",
				"localPluginId",
				target.id,
			);
			for (const { value } of rows)
				if (!conversationMeta.get(target.id)?.has(value.id)) hydrate(value);
			loadedConversationLists.add(target.id);
			return;
		}
		if (containers.has(target.id)) return;
		let conversation = [...conversationMeta.values()]
			.map((list) => list.get(target.id))
			.find(Boolean);
		if (!conversation) {
			const hydrate = handlers.get("meta")?.hydrate;
			if (!hydrate) throw new Error("syncStore 缺少 meta 的加载实现。");
			const value = await host.database.selectOne<ConversationMeta>(
				"conversations",
				target.id,
			);
			if (!value) return;
			hydrate(value);
			conversation = value;
		}
		if (!containers.has(target.id)) {
			const rows = await host.database.selectByField<ConversationContainer>(
				"message_containers",
				"conversationId",
				target.id,
			);
			containers.set(
				target.id,
				shallowReactive(
					new Map(
						rows.map(({ value }) => [
							value.id,
							reactive(value) as ConversationContainer,
						]),
					),
				),
			);
		}
	}

	async function unload(
		target: Exclude<SyncTarget, { type: "conversationVersionIndex" }>,
	) {
		if (target.type === "plugin") {
			await _sync({ type: "plugin", id: target.id });
			plugins.delete(target.id);
			return;
		}
		if (target.type === "conversationList") {
			if (!loadedConversationLists.delete(target.id)) return;
			const list = conversationMeta.get(target.id);
			for (const conversation of [...(list?.values() ?? [])]) {
				if (containers.has(conversation.id)) continue;
				await _sync({ type: "meta", id: conversation.id });
				list?.delete(conversation.id);
			}
			return;
		}
		if (!containers.has(target.id)) return;
		await _sync();
		const conversation = [...conversationMeta.values()]
			.map((list) => list.get(target.id))
			.find(Boolean);
		containers.delete(target.id);
		if (
			conversation &&
			!loadedConversationLists.has(conversation.localPluginId)
		)
			conversationMeta.get(conversation.localPluginId)?.delete(conversation.id);
	}

	function clearAll() {
		if (timer) clearTimeout(timer);
		timer = undefined;
		plugins.clear();
		characters.clear();
		conversationMeta.clear();
		containers.clear();
		loadedConversationLists.clear();
		dirty.clear();
		initGeneration++;
		initPromise = undefined;
	}

	return {
		plugins,
		characters,
		conversationMeta,
		containers,
		init,
		load,
		unload,
		markDirty,
		_sync,
		clearAll,
	};
});
