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

export type AdditionalParts = FilePart | ActionPart;

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
	};
	steps: (ThinkingStep | ToolCallStep | ToolCallResult)[];
	worldUpdates?: any[];
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
