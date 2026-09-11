import type { ModelMessage } from "ai";
import { readMediaLink } from "@/features/Media/media-link";
import type { AdditionalParts, ChatMessage, ChatContainer, Role } from "./types";

export function createMessage(input: { type?: ChatMessage["type"]; content?: string; parts?: AdditionalParts[] } = {}): ChatMessage {
	return { id: crypto.randomUUID(), type: input.type ?? "message", content: input.content ?? "", parts: input.parts ?? [], createdAt: new Date().toISOString(), meta: { steps: [] } };
}

export function createContainer(input: { conversationId: string; role: Role; content?: string; parts?: AdditionalParts[]; previousContainer?: string | null }): ChatContainer {
	return { id: crypto.randomUUID(), role: input.role, conversationid: input.conversationId, content: [createMessage({ content: input.content, parts: input.parts })], activeMessage: 0, availableNextContainer: [], activeNextContainer: null, previousContainer: input.previousContainer ?? null };
}

export function currentMessage(container: ChatContainer | null | undefined): ChatMessage | null {
	return container?.content[container.activeMessage ?? 0] ?? container?.content[0] ?? null;
}

export function pathForTail(containers: Iterable<ChatContainer>, tailId?: string | null): ChatContainer[] {
	const byId = new Map([...containers].map(item => [item.id, item]));
	const path: ChatContainer[] = [];
	const seen = new Set<string>();
	let current = tailId ? byId.get(tailId) : undefined;
	while (current && !seen.has(current.id)) { seen.add(current.id); path.unshift(current); current = current.previousContainer ? byId.get(current.previousContainer) : undefined; }
	return path;
}

export async function modelMessagesFromPath(path: ChatContainer[]): Promise<ModelMessage[]> {
	const messages: ModelMessage[] = [];
	for (const container of path) {
		const message = currentMessage(container);
		if (!message || message.type === "error" || message.meta.intervalOperations?.length) continue;
		if (container.role !== "user") { messages.push({ role: container.role, content: message.content } as ModelMessage); continue; }
		const content: Array<{ type: "text"; text: string } | { type: "file"; data: Uint8Array | string; mimeType: string }> = message.content ? [{ type: "text", text: message.content }] : [];
		for (const part of message.parts ?? []) {
			if (part.type === "file") { const media = await readMediaLink(part.url); content.push({ type: "file", data: media?.bytes ? Uint8Array.from(media.bytes) : part.url, mimeType: part.mediaType }); }
			if (part.type === "reference") content.push({ type: "text", text: `\n[引用${part.referenceType === "file" ? "文件" : "消息"}：${part.label}${part.path ? ` (${part.path})` : ""}]\n${part.content}` });
		}
		messages.push({ role: "user", content } as ModelMessage);
	}
	return messages;
}
