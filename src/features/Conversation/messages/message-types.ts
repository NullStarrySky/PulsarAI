import type { Pulse } from "@/features/Plugin/tree/world-update";
import type { IntervalOperation } from "./interval-service";

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
	/** Snapshot used by generation; ids remain available for navigation. */
	content: string;
}

export type AdditionalParts = FilePart | ActionPart | ReferencePart;

export interface TokenUsage {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
}

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

export interface MessageMeta {
	generateInfo?: {
		modelName?: string;
		startTime?: string;
		finishTime?: string;
		usage?: TokenUsage;
	};
	steps: (ThinkingStep | ToolCallStep | ToolCallResult)[];
	/** Ordered, replayable World changes created along this message path. */
	pulses?: Pulse[];
	/** Ordered Interval operations bound to this concrete message version. */
	intervalOperations?: IntervalOperation[];
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
	parts?: AdditionalParts[];
	createdAt: string;
	meta: MessageMeta;
	favorite?: boolean;
}

export interface ChatMessageContainer {
	id: string;
	role: Role;
	conversationid: string;
	content: ChatMessage[];
	activeMessage?: number | null;
	availableNextContainer: string[];
	activeNextContainer?: string | null;
	previousContainer?: string | null;
}
