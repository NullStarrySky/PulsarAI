import type { ModelMessage } from "ai";
import {
	remove,
	selectAll,
	selectByField,
	selectOne,
	upsert,
} from "@/features/Database/database-service";
import type {
	AdditionalParts,
	ChatMessage,
	ChatMessageContainer,
	Role,
} from "./message-types";
import { readMediaLink } from "@/features/Media/media-link";

const containerTable = "message_containers";

export async function loadContainersForChat(
	chatId: string,
): Promise<ChatMessageContainer[]> {
	const records = await selectByField<ChatMessageContainer>(
		containerTable,
		"conversationid",
		chatId,
	);
	return records.map((record) => record.value);
}

export async function loadContainer(
	id: string,
): Promise<ChatMessageContainer | null> {
	return selectOne<ChatMessageContainer>(containerTable, id);
}

export async function selectAllContainers(): Promise<ChatMessageContainer[]> {
	const records = await selectAll<ChatMessageContainer>(containerTable);
	return records.map((record) => record.value);
}

import { notifyContainerUpdated } from "../conversation-shared-state";

export async function persistContainer(
	container: ChatMessageContainer,
): Promise<void> {
	await upsert(containerTable, container.id, container);
	notifyContainerUpdated(container);
}

export async function deleteContainer(containerId: string): Promise<void> {
	await remove(containerTable, containerId);
}

export async function deleteContainersForChat(chatId: string): Promise<void> {
	const containers = await loadContainersForChat(chatId);
	for (const container of containers) {
		await deleteContainer(container.id);
	}
}

export function createMessage(options?: {
	type?: "message" | "error";
	content?: string;
	parts?: AdditionalParts[];
}): ChatMessage {
	return {
		id: crypto.randomUUID(),
		type: options?.type ?? "message",
		content: options?.content ?? "",
		parts: options?.parts ?? [],
		createdAt: new Date().toISOString(),
		meta: {
			steps: [],
		},
	};
}

export function createContainer(options: {
	conversationId: string;
	role: Role;
	content?: string;
	parts?: AdditionalParts[];
	previousContainer?: string | null;
}): ChatMessageContainer {
	return {
		id: crypto.randomUUID(),
		role: options.role,
		conversationid: options.conversationId,
		content: [
			createMessage({
				content: options.content,
				parts: options.parts,
			}),
		],
		activeMessage: 0,
		availableNextContainer: [],
		activeNextContainer: null,
		previousContainer: options.previousContainer ?? null,
	};
}

export function currentMessage(
	container: ChatMessageContainer | null | undefined,
): ChatMessage | null {
	if (!container || !container.content?.length) return null;
	const index = container.activeMessage ?? 0;
	return container.content[index] ?? container.content[0] ?? null;
}

export function pathForTail(
	containers: ChatMessageContainer[],
	tailId?: string | null,
): ChatMessageContainer[] {
	if (!tailId || containers.length === 0) return [];
	const byId = new Map(containers.map((item) => [item.id, item]));
	const visited = new Set<string>();
	const path: ChatMessageContainer[] = [];
	let current = byId.get(tailId);

	while (current && !visited.has(current.id)) {
		visited.add(current.id);
		path.unshift(current);
		if (!current.previousContainer) break;
		current = byId.get(current.previousContainer);
	}
	return path;
}

export async function modelMessagesFromPath(
	path: ChatMessageContainer[],
): Promise<ModelMessage[]> {
	const result: ModelMessage[] = [];
	for (const container of path) {
		const msg = currentMessage(container);
		if (!msg || msg.type === "error") continue;
		if (msg.meta.intervalOperations?.length) continue;
		const role = container.role;

		if (role === "user") {
			const parts: any[] = [];
			if (msg.content) {
				parts.push({ type: "text", text: msg.content });
			}
			if (msg.parts) {
				for (const part of msg.parts) {
					if (part.type === "file") {
						const media = await readMediaLink(part.url);
						parts.push({
							type: "file",
							data: media?.bytes ?? part.url,
							mimeType: part.mediaType,
						});
					} else if (part.type === "reference") {
						parts.push({
							type: "text",
							text: `\n[引用${part.referenceType === "file" ? "文件" : "消息"}：${part.label}${part.path ? ` (${part.path})` : ""}]\n${part.content}`,
						});
					}
				}
			}
			result.push({ role: "user", content: parts });
		} else if (role === "assistant") {
			result.push({ role: "assistant", content: msg.content });
		} else if (role === "system") {
			result.push({ role: "system", content: msg.content });
		}
	}
	return result;
}
