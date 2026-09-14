import { computed, watch } from "vue";
import { selectAll } from "@/features/Database/database-service";
import {
	registerSyncHandler,
	useSyncStore,
} from "@/features/Database/dbsync-store";
import { latestPluginVersion } from "@/features/Plugin/dataflow/plugin-version";
import {
	type ChatGenerationState,
	type ChatMeta,
	createChatMeta,
	type PersistedChatMeta,
} from "./types";

function chatsForPlugin(pluginId: string) {
	return useSyncStore().chatMeta.get(pluginId) as
		| Map<string, ChatMeta>
		| undefined;
}

function findChat(chatId: string) {
	return [...useSyncStore().chatMeta.values()]
		.map((list) => list.get(chatId))
		.find(Boolean);
}

registerSyncHandler<ChatMeta, PersistedChatMeta>("meta", {
	table: "conversations",
	value: findChat,
	serialize(chat) {
		const { generation: _generation, ...record } = chat;
		return record;
	},
});

/** Read only persistent fields, without subscribing to runtime generation. */
export function chatRecord(value: ChatMeta): PersistedChatMeta {
	return {
		id: value.id,
		localPluginId: value.localPluginId,
		pluginVersionId: value.pluginVersionId,
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
	};
}

/** A loaded set of a role's conversations. Its actions are the only mutations. */
export function useChatList(pluginId: string) {
	const store = useSyncStore();
	const chats = computed(
		() => new Set(chatsForPlugin(pluginId)?.values() ?? []),
	);
	function create(
		input: Partial<Pick<ChatMeta, "title" | "lifetime" | "isTemplate">> = {},
	) {
		const plugin = store.plugins.get(pluginId);
		const version = plugin && latestPluginVersion(plugin);
		if (!version)
			throw new Error(`本地 Plugin 没有可用于会话的版本：${pluginId}`);
		const chat = createChatMeta({
			localPluginId: pluginId,
			pluginVersionId: version.id,
			...input,
		});
		store.addChat(chat);
		store.markDirty({ type: "meta", id: chat.id });
		return chat;
	}
	function remove(chatId: string) {
		if (!chatsForPlugin(pluginId)?.has(chatId)) return;
		store.removeChat(chatId);
	}
	return { chats, create, delete: remove };
}

/** Scoped mutable chat handle, excluding runtime-only state from persistence. */
export function useChat(chatId: string) {
	const store = useSyncStore();
	const chat = computed(() => findChat(chatId) ?? null);
	watch(
		() => (chat.value ? chatRecord(chat.value) : null),
		(record) => {
			if (!record || !chat.value) return;
			store.trackChatPluginVersion(chat.value);
			store.markDirty({ type: "meta", id: chatId });
		},
		{ deep: true, flush: "sync" },
	);
	return chat;
}

/** Generation is runtime state; changing it must not cause a persistence write. */
export function setChatGeneration(chatId: string, value?: ChatGenerationState) {
	const chat = findChat(chatId);
	if (chat) chat.generation = value;
}

export function isChatGenerating(chatId: string) {
	return computed(() => Boolean(findChat(chatId)?.generation));
}

/** Removes app-lifetime chats left by a previous process, including their containers. */
export async function cleanupAppLifetimeChats() {
	const store = useSyncStore();
	const chats = (await selectAll<ChatMeta>("conversations"))
		.map((record) => record.value)
		.filter((chat) => chat.lifetime === "app");
	for (const chat of chats) {
		await store.load({ type: "chatList", id: chat.localPluginId });
		await store.load({ type: "chat", id: chat.id });
		store.removeChat(chat.id);
	}
	await store._sync();
	return chats.length;
}
