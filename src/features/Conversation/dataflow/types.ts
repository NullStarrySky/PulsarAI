import type { Pulse } from "@/features/Plugin/dataflow";

export type Role = "user" | "assistant" | "system";

export interface FilePart {
	type: "file";
	mediaType: string;
	url: string;
	filename?: string;
	size?: number;
}
export interface ActionPart {
	type: "action";
	id: string;
	label: string;
	action: string;
	params?: Record<string, unknown>;
}
export interface ReferencePart {
	type: "reference";
	referenceType: "file" | "message";
	id: string;
	label: string;
	path?: string;
	content: string;
}
export type AdditionalParts = FilePart | ActionPart | ReferencePart;
export interface ThinkingStep {
	type: "thinking";
	id?: string;
	message: string;
}
export interface ToolCallStep {
	type: "tool-call";
	toolCallId: string;
	toolName: string;
	input: unknown;
}
export interface ToolCallResult {
	type: "tool-result";
	toolCallId: string;
	toolName: string;
	input: unknown;
	output: unknown;
}
export interface TokenUsage {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
}

export interface MessageMeta {
	steps: Array<ThinkingStep | ToolCallStep | ToolCallResult>;
	intervalOperations?: import("./activePathComposable/interval-services").IntervalOperation[];
	pulses?: Pulse[];
	generateInfo?: {
		modelName?: string;
		startTime?: string;
		finishTime?: string;
		usage?: TokenUsage;
	};
	translation?: {
		translatedContent: string;
		modelName?: string;
		targetLanguage: string;
		lastUpdated?: string;
	};
}

export interface ChatMessage {
	id: string;
	type: "message" | "error";
	content: string;
	createdAt: string;
	parts?: AdditionalParts[];
	favorite?: boolean;
	meta: MessageMeta;
}

export interface ChatContainer {
	id: string;
	role: Role;
	conversationid: string;
	content: ChatMessage[];
	activeMessage?: number | null;
	availableNextContainer: string[];
	activeNextContainer?: string | null;
	previousContainer?: string | null;
}

/** Fields that are permitted to reach the conversations table. */
export interface PersistedChatMeta {
	id: string;
	localPluginId: string;
	title: string;
	rootContainerId: string | null;
	lastContainerId: string | null;
	lastMessagePreview?: string;
	composerDraft: ChatContainer;
	createdAt: string;
	updatedAt: string;
	lifetime: "persistent" | "app";
	pinned?: boolean;
	isTemplate?: boolean;
}

/** Runtime-only generation progress. It deliberately has no database shape. */
export interface ChatGenerationState {
	messageId?: string;
}

export interface ChatMeta extends PersistedChatMeta {
	generation?: ChatGenerationState;
}

export interface CharacterData {
	id: string;
	name: string;
	description?: string;
	avatarUrl?: string;
	coverUrl?: string;
}

export function createDraft(conversationid = ""): ChatContainer {
	return {
		id: "draft-container",
		role: "user",
		conversationid,
		content: [
			{
				id: "draft-message",
				type: "message",
				content: "",
				createdAt: new Date().toISOString(),
				parts: [],
				meta: { steps: [] },
			},
		],
		activeMessage: 0,
		availableNextContainer: [],
		activeNextContainer: null,
		previousContainer: null,
	};
}

export function createChatMeta(
	input: Pick<ChatMeta, "localPluginId"> &
		Partial<Pick<ChatMeta, "title" | "lifetime" | "isTemplate">>,
): ChatMeta {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	return {
		id,
		localPluginId: input.localPluginId,
		title: input.title?.trim() || "新对话",
		rootContainerId: null,
		lastContainerId: null,
		composerDraft: createDraft(id),
		createdAt: now,
		updatedAt: now,
		lifetime: input.lifetime ?? "persistent",
		pinned: false,
		isTemplate: input.isTemplate ?? false,
	};
}

export function createChatContainer(
	input: Pick<ChatContainer, "conversationid" | "role"> &
		Partial<Pick<ChatContainer, "previousContainer">>,
): ChatContainer {
	return {
		id: crypto.randomUUID(),
		role: input.role,
		conversationid: input.conversationid,
		content: [],
		activeMessage: 0,
		availableNextContainer: [],
		activeNextContainer: null,
		previousContainer: input.previousContainer ?? null,
	};
}
