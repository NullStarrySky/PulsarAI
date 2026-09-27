import type { RECAL } from "@/features/Plugin/dataflow/types";

export type Role = "user" | "assistant" | "system";

export interface FilePart {
	type: "file";
	mediaType: string;
	url: string;
	filename?: string;
	size?: number;
}
interface ActionPart {
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
interface TokenUsage {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
}

interface MessageMeta {
	steps: Array<ThinkingStep | ToolCallStep | ToolCallResult>;
	intervalOperations?: import("./activePathComposable/interval-services").IntervalOperation[];
	recal?: RECAL;
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

export interface ConversationMessage {
	id: string;
	type: "message" | "error";
	content: string;
	/** False while its stream is accepting input; completed messages are final. */
	final: boolean;
	createdAt: string;
	parts?: AdditionalParts[];
	favorite?: boolean;
	meta: MessageMeta;
}

export interface ConversationContainer {
	id: string;
	role: Role;
	conversationId: string;
	content: ConversationMessage[];
	activeMessage?: number | null;
	availableNextContainer: string[];
	activeNextContainer?: string | null;
	previousContainer?: string | null;
}

export interface ConversationMeta {
	id: string;
	localPluginId: string;
	pluginVersionId: string;
	title: string;
	rootContainerId: string | null;
	lastContainerId: string | null;
	lastMessagePreview?: string;
	composerDraft: ConversationContainer;
	createdAt: string;
	updatedAt: string;
	lifetime: "persistent" | "app";
	pinned?: boolean;
	isTemplate?: boolean;
}

export function createDraft(conversationId = ""): ConversationContainer {
	return {
		id: "draft-container",
		role: "user",
		conversationId,
		content: [
			{
				id: "draft-message",
				type: "message",
				content: "",
				final: true,
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

export function createConversationMeta(
	input: Pick<ConversationMeta, "localPluginId" | "pluginVersionId"> &
		Partial<Pick<ConversationMeta, "title" | "lifetime" | "isTemplate">>,
): ConversationMeta {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	return {
		id,
		localPluginId: input.localPluginId,
		pluginVersionId: input.pluginVersionId,
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
