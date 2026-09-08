import { ref } from "vue";
import {
	remove,
	selectAll,
	selectByField,
	selectOne,
	upsert,
} from "@/features/Database/database-service";
import { deleteContainersForChat } from "../messages/message-service";
import {
	type Conversation,
	createDefaultComposerDraft,
} from "./chat-types";
import { notifyChatUpdated } from "../conversation-shared-state";

const chatTable = "conversations";

// 轻量无状态生成指示器，按 chatId 标记是否正在流式生成
const generatingChatIds = ref(new Set<string>());
const generatingMessageIds = ref(new Map<string, string>());

export function isChatGenerating(chatId: string): boolean {
	return generatingChatIds.value.has(chatId);
}

export function isMessageGenerating(chatId: string, messageId: string): boolean {
	if (!chatId || !messageId) return false;
	return generatingMessageIds.value.get(chatId) === messageId;
}

export function setChatGenerating(
	chatId: string,
	generating: boolean,
	messageId?: string,
): void {
	const next = new Set(generatingChatIds.value);
	const nextMsgs = new Map(generatingMessageIds.value);
	if (generating) {
		next.add(chatId);
		if (messageId) {
			nextMsgs.set(chatId, messageId);
		}
	} else {
		next.delete(chatId);
		nextMsgs.delete(chatId);
	}
	generatingChatIds.value = next;
	generatingMessageIds.value = nextMsgs;
}

export async function loadChat(id: string): Promise<Conversation | null> {
	return selectOne<Conversation>(chatTable, id);
}

export async function loadChatsForLocalPlugin(
	localPluginId: string,
): Promise<Conversation[]> {
	const records = await selectByField<Conversation>(
		chatTable,
		"localPluginId",
		localPluginId,
	);
	return records.map((record) => record.value);
}

export async function selectAllChats(): Promise<Conversation[]> {
	const records = await selectAll<Conversation>(chatTable);
	return records.map((record) => record.value);
}

export async function persistChat(chat: Conversation): Promise<void> {
	await upsert(chatTable, chat.id, chat);
	notifyChatUpdated(chat);
}

export async function createChat(options: {
	localPluginId: string;
	title?: string;
	isTemplate?: boolean;
	lifetime?: Conversation["lifetime"];
}): Promise<Conversation> {
	const now = new Date().toISOString();
	const id = crypto.randomUUID();
	const chat: Conversation = {
		id,
		localPluginId: options.localPluginId,
		title: options.title || "新对话",
		rootContainerId: null,
		lastContainerId: null,
		composerDraft: createDefaultComposerDraft(id),
		createdAt: now,
		updatedAt: now,
		lifetime: options.lifetime ?? "persistent",
		pinned: false,
		isTemplate: options.isTemplate ?? false,
	};
	await persistChat(chat);
	return chat;
}

export async function updateChat(
	id: string,
	patch: Partial<Conversation>,
): Promise<Conversation | null> {
	const current = await loadChat(id);
	if (!current) return null;
	const updated: Conversation = {
		...current,
		...patch,
		updatedAt: new Date().toISOString(),
	};
	await persistChat(updated);
	return updated;
}

export async function deleteChatCascade(chatId: string): Promise<void> {
	await deleteContainersForChat(chatId);
	await remove(chatTable, chatId);
}

/** Removes persisted app-lifetime conversations left by a previous process. */
export async function cleanupAppLifetimeChats(): Promise<number> {
	const chats = await selectAllChats();
	const temporary = chats.filter((chat) => chat.lifetime === "app");
	for (const chat of temporary) await deleteChatCascade(chat.id);
	return temporary.length;
}
