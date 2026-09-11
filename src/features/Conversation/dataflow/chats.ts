import { computed } from "vue";
import { selectAll } from "@/features/Database/database-service";
import {
	registerSyncHandler,
	useSyncStore,
} from "@/features/Database/dbsync-store";
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

/** A loaded set of a role's conversations. Its actions are the only mutations. */
export function useChatList(pluginId: string) {
	const store = useSyncStore();
	const chats = computed(
		() => new Set(chatsForPlugin(pluginId)?.values() ?? []),
	);
	function create(
		input: Partial<Pick<ChatMeta, "title" | "lifetime" | "isTemplate">> = {},
	) {
		const chat = createChatMeta({ localPluginId: pluginId, ...input });
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

/** Thin reactive address lookup; it adds no persistence behavior. */
export function useChat(chatId: string) {
	return computed(() => findChat(chatId) ?? null);
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
