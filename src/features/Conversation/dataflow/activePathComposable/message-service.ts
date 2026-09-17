import type { ModelMessage } from "ai";
import { readMediaLink } from "@/features/Plugin/media/media-link";
import type {
	AdditionalParts,
	ConversationContainer,
	ConversationMessage,
	Role,
} from "../types";

export function createMessage(
	input: {
		type?: ConversationMessage["type"];
		content?: string;
		final?: boolean;
		parts?: AdditionalParts[];
	} = {},
): ConversationMessage {
	return {
		id: crypto.randomUUID(),
		type: input.type ?? "message",
		content: input.content ?? "",
		final: input.final ?? true,
		parts: input.parts ?? [],
		createdAt: new Date().toISOString(),
		meta: { steps: [] },
	};
}

export function createContainer(input: {
	conversationId: string;
	role: Role;
	content?: string;
	final?: boolean;
	parts?: AdditionalParts[];
	previousContainer?: string | null;
}): ConversationContainer {
	return {
		id: crypto.randomUUID(),
		role: input.role,
		conversationId: input.conversationId,
		content: [
			createMessage({
				content: input.content,
				parts: input.parts,
				final: input.final,
			}),
		],
		activeMessage: 0,
		availableNextContainer: [],
		activeNextContainer: null,
		previousContainer: input.previousContainer ?? null,
	};
}

export function currentMessage(
	container: ConversationContainer | null | undefined,
): ConversationMessage | null {
	return (
		container?.content[container.activeMessage ?? 0] ??
		container?.content[0] ??
		null
	);
}

export function pathForTail(
	containers: ReadonlyMap<string, ConversationContainer>,
	tailId?: string | null,
): ConversationContainer[] {
	const path: ConversationContainer[] = [];
	const seen = new Set<string>();
	let current = tailId ? containers.get(tailId) : undefined;
	while (current && !seen.has(current.id)) {
		seen.add(current.id);
		path.push(current);
		current = current.previousContainer
			? containers.get(current.previousContainer)
			: undefined;
	}
	return path.reverse();
}

export async function modelMessagesFromPath(
	path: ConversationContainer[],
): Promise<ModelMessage[]> {
	const messages: ModelMessage[] = [];
	for (const container of path) {
		const message = currentMessage(container);
		if (
			!message ||
			message.type === "error" ||
			message.meta.intervalOperations?.length
		)
			continue;
		if (container.role !== "user") {
			messages.push({
				role: container.role,
				content: message.content,
			} as ModelMessage);
			continue;
		}
		const content: Array<
			| { type: "text"; text: string }
			| { type: "file"; data: Uint8Array | string; mimeType: string }
		> = message.content ? [{ type: "text", text: message.content }] : [];
		for (const part of message.parts ?? []) {
			if (part.type === "file") {
				const media = await readMediaLink(part.url);
				content.push({
					type: "file",
					data: media?.bytes ? Uint8Array.from(media.bytes) : part.url,
					mimeType: part.mediaType,
				});
			}
			if (part.type === "reference")
				content.push({
					type: "text",
					text: `\n[引用${part.referenceType === "file" ? "文件" : "消息"}：${part.label}${part.path ? ` (${part.path})` : ""}]\n${part.content}`,
				});
		}
		messages.push({ role: "user", content } as ModelMessage);
	}
	return messages;
}
