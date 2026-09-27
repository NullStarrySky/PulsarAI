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
export type SyncTarget =
	| { type: "conversationList"; id: ConversationMeta["localPluginId"] }
	| { type: "conversation"; id: ConversationMeta["id"] }
	| { type: "plugin"; id: CharacterData["id"] }
	| { type: "conversationVersionIndex" };

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
	const generation = shallowReactive(
		new Map<ConversationMeta["id"], { messageId?: string }>(),
	);
	const dirty: DirtyTarget[] = [];
	const loadedConversationLists = new Set<ConversationMeta["localPluginId"]>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pendingFlush = Promise.resolve();
	let initPromise: Promise<void> | undefined;
	let initGeneration = 0;

	function findConversation(id: ConversationMeta["id"]) {
		for (const list of conversationMeta.values()) {
			const conversation = list.get(id);
			if (conversation) return conversation;
		}
	}

	function findContainer(id: ConversationContainer["id"]) {
		for (const list of containers.values()) {
			const container = list.get(id);
			if (container) return container;
		}
	}

	function loadConversation(value: ConversationMeta) {
		let list = conversationMeta.get(value.localPluginId);
		if (!list) {
			list = shallowReactive(
				new Map<ConversationMeta["id"], ConversationMeta>(),
			);
			conversationMeta.set(value.localPluginId, list);
		}
		const current = list.get(value.id);
		if (current) return current;
		for (const message of value.composerDraft.content) message.final ??= true;
		const conversation = reactive(value) as ConversationMeta;
		list.set(value.id, conversation);
		return conversation;
	}

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
		if (
			!dirty.some((item) => item.type === target.type && item.id === target.id)
		)
			dirty.push(target);
		if (timer) return;
		timer = setTimeout(() => {
			timer = undefined;
			void _sync();
		}, 500);
	}

	async function syncTarget(target: DirtyTarget) {
		const index = dirty.findIndex(
			(item) => item.type === target.type && item.id === target.id,
		);
		if (index < 0) return;
		let table: string;
		let recordId = target.id;
		let value: unknown;
		switch (target.type) {
			case "plugin":
				table = "resource_worlds";
				recordId = `local:${target.id}`;
				value = plugins.get(target.id);
				break;
			case "character":
				table = "resource_characters";
				value = characters.get(target.id);
				break;
			case "meta":
				table = "conversations";
				value = findConversation(target.id);
				break;
			case "container":
				table = "message_containers";
				value = findContainer(target.id);
				break;
		}
		dirty.splice(index, 1);
		try {
			if (value === undefined) await host.database.remove(table, recordId);
			else
				await host.database.upsert(
					table,
					recordId,
					JSON.parse(JSON.stringify(value)),
				);
		} catch (error) {
			if (
				!dirty.some(
					(item) => item.type === target.type && item.id === target.id,
				)
			)
				dirty.push(target);
			throw error;
		}
	}

	function _sync(target?: DirtyTarget) {
		if (timer) clearTimeout(timer);
		timer = undefined;
		const flush = pendingFlush.then(async () => {
			for (const entry of target ? [target] : [...dirty])
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
		if (target.type === "conversationList") {
			if (loadedConversationLists.has(target.id)) return;
			const rows = await host.database.selectByField<ConversationMeta>(
				"conversations",
				"localPluginId",
				target.id,
			);
			for (const { value } of rows) loadConversation(value);
			loadedConversationLists.add(target.id);
			return;
		}
		if (containers.has(target.id)) return;
		let conversation = findConversation(target.id);
		if (!conversation) {
			const value = await host.database.selectOne<ConversationMeta>(
				"conversations",
				target.id,
			);
			if (!value) return;
			conversation = loadConversation(value);
		}
		if (!containers.has(target.id)) {
			const rows = await host.database.selectByField<ConversationContainer>(
				"message_containers",
				"conversationid",
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
		if (!containers.has(target.id)) {
			generation.delete(target.id);
			return;
		}
		await _sync();
		const conversation = findConversation(target.id);
		containers.delete(target.id);
		generation.delete(target.id);
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
		generation.clear();
		loadedConversationLists.clear();
		dirty.length = 0;
		initGeneration++;
		initPromise = undefined;
	}

	return {
		plugins,
		characters,
		conversationMeta,
		containers,
		generation,
		init,
		load,
		unload,
		markDirty,
		_sync,
		clearAll,
	};
});
