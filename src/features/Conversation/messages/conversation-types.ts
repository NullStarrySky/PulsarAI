export type Role = "assistant" | "user" | "system";
export type ChatMessageType = "message" | "error";

export function formatChatMessageError(content: unknown) {
	const message =
		content instanceof Error ? content.message : String(content ?? "生成失败");
	const normalized = message.trim() || "生成失败";
	return normalized.startsWith("[ERROR]")
		? normalized
		: `[ERROR] ${normalized}`;
}

export type {
	CharacterPackage,
	PackageCategory,
} from "@/features/Package/package-types";

import type { WorldUpdate } from "@/features/Plugin/tree/world-update";

type ConversationRendererId = "chat" | "novel";

export type ConversationKind = "chat" | "test";

export interface ConversationResourceBinding {
	packageId?: string;
	resourceType: string;
	resourceId: string;
	resourcePath?: string;
	resourceTitle?: string;
}

export interface Conversation {
	id: string;
	packageId: string;
	kind: ConversationKind;
	binding?: ConversationResourceBinding;
	title: string;
	pinned?: boolean;
	isTemplate?: boolean;
	isEphemeral?: boolean;
	rendererId?: ConversationRendererId;
	rootContainerId: string | null;
	lastContainerId: string | null;
	createdAt: string;
	updatedAt: string;
	/** Unsent composer text. It is user content, but never part of chat history. */
	composerDraft?: string;
}

export interface ToolCallResult {
	type: "tool-result";
	toolCallId: string;
	toolName: string;
	input: unknown;
	output: unknown;
}

export interface ToolCallStep {
	type: "tool-call";
	toolCallId: string;
	toolName: string;
	input: unknown;
}

export interface ThinkingStep {
	type: "thinking";
	id: string;
	message: string;
}

export type DataContent = string | Uint8Array | ArrayBuffer;

interface TextPart {
	type: "text";
	text: string;
}

interface ImagePart {
	type: "image";
	image: DataContent | URL;
	mediaType?: string;
}

export interface FilePart {
	type: "file";
	data: DataContent | URL;
	filename?: string;
	mediaType: string;
	size?: number;
}

export interface ActionPart {
	type: "action";
	actionId: string;
	sourcePath: string;
	sourceName: string;
	name: string;
	description: string;
}

export type AdditionalParts = TextPart | ImagePart | FilePart | ActionPart;

export type ChatMessageMeta = {
	translation?: {
		originalContent: string;
		translatedAt: string;
	};
	generateInfo?: {
		modelName: string;
		startTime: string;
		timeUsed?: number;
	};
	environmentInfo?: {
		sourcePath: string;
		sourceName: string;
		characterId: string;
		characterName: string;
		resolvedResourceIds?: string[];
		diagnostics?: string[];
	};
	/** Ordered World updates owned by this concrete message version. */
	worldUpdates?: WorldUpdate[];
	/** Only Agent reasoning and model tool calls are persisted here. */
	steps: (ThinkingStep | ToolCallStep | ToolCallResult)[];
};

export type ChatMessage = {
	id: string;
	type: ChatMessageType;
	content: string;
	createdAt: string;
	favorite?: boolean;
	meta: ChatMessageMeta;
	parts?: AdditionalParts[];
};

export type ChatMessageContainer = {
	id: string;
	role: Role;
	conversationid: string;
	content: ChatMessage[];
	activeMessage: number | null;
	availableNextContainer: string[];
	activeNextContainer: string | null;
	previousContainer: string | null;
	/** Command runs are persisted in the causal path but omitted from normal chat context. */
	hidden?: boolean;
	/** Auditable invocation metadata for a hidden command-generation container. */
	command?: {
		name: string;
		args: string;
	};
	/** Command-local Markdown scratchpad, exposed to its process as ctx.draft. */
	draft?: string;
};
