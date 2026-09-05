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

const chatTable = "conversations";

// 轻量无状态生成指示器，按 chatId 标记是否正在流式生成
const generatingChatIds = ref(new Set<string>());

export function isChatGenerating(chatId: string): boolean {
	return generatingChatIds.value.has(chatId);
}

export function setChatGenerating(chatId: string, generating: boolean): void {
	const next = new Set(generatingChatIds.value);
	if (generating) {
		next.add(chatId);
	} else {
		next.delete(chatId);
	}
	generatingChatIds.value = next;
}

export async function loadChat(id: string): Promise<Conversation | null> {
	return selectOne<Conversation>(chatTable, id);
}

export async function loadChatsForPackage(
	packageId: string,
): Promise<Conversation[]> {
	const records = await selectByField<Conversation>(
		chatTable,
		"packageId",
		packageId,
	);
	return records.map((record) => record.value);
}

export async function selectAllChats(): Promise<Conversation[]> {
	const records = await selectAll<Conversation>(chatTable);
	return records.map((record) => record.value);
}

export async function persistChat(chat: Conversation): Promise<void> {
	await upsert(chatTable, chat.id, chat);
}

export async function createChat(options: {
	packageId: string;
	title?: string;
	isTemplate?: boolean;
}): Promise<Conversation> {
	const now = new Date().toISOString();
	const id = crypto.randomUUID();
	const chat: Conversation = {
		id,
		packageId: options.packageId,
		title: options.title || "新对话",
		rootContainerId: null,
		lastContainerId: null,
		composerDraft: createDefaultComposerDraft(id),
		createdAt: now,
		updatedAt: now,
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
