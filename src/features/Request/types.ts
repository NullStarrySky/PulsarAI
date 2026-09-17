export type RequestKind = "text" | "image" | "video" | "speech" | "transcribe";
export type ParamGroup = "basic" | RequestKind | "provider";

export interface ParamDefinition {
	/** Dot-separated destination below the request object. */
	paramName: string;
	enableInDefault: boolean;
	title?: string;
	description?: string;
	customBlockComponent?: string;
	paramComponent: {
		component: string;
		componentParam: unknown;
	};
	defaultValue: unknown;
	value: unknown;
	valueChecker?: string;
}

export interface ModelDefinition {
	id: string;
	displayName: string;
	enabled: boolean;
	description?: string;
	icon?: string;
	/** Display-only provider metadata. It must never control request routing. */
	extraInfo?: Record<string, string>;
}

export interface RequestOverride {
	generateText?: string;
	streamText?: string;
	generateImage?: string;
	generateVideo?: string;
	generateSpeech?: string;
	transcribe?: string;
	ToolLoopAgent?: string;
}

export interface Provider {
	id: string;
	name: string;
	description?: string;
	icon?: string;
	iconUrl?: string;
	enabled: boolean;
	params: Record<ParamGroup, ParamDefinition[]>;
	modelGetter?: string;
	models: Record<RequestKind, ModelDefinition[]>;
	/** Builds an AI SDK model from this Provider and the selected model id. */
	hydrator?: string;
	requestOverride: RequestOverride;
}

export interface ModelSelection {
	providerId: string;
	modelId: string;
	kind: RequestKind;
}

export interface GeneratedImage {
	mediaType: string;
	uint8Array: Uint8Array;
	base64: string;
}

export interface ServiceProviderView {
	id: string;
	name: string;
	description?: string;
	icon?: string;
	iconUrl?: string;
	enabled: boolean;
	source: "model" | "feature";
}

export type ReasoningEffort =
	| "none"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh";
export type ThinkingLevel = "auto" | ReasoningEffort;

export const thinkingLevelOptions = [
	{ value: "auto", label: "自动" },
	{ value: "none", label: "关闭" },
	{ value: "minimal", label: "最小" },
	{ value: "low", label: "低" },
	{ value: "medium", label: "中" },
	{ value: "high", label: "高" },
	{ value: "xhigh", label: "超高" },
] as const satisfies ReadonlyArray<{ value: ThinkingLevel; label: string }>;

const reasoningEfforts = new Set<ReasoningEffort>(
	thinkingLevelOptions
		.map((option) => option.value)
		.filter((value): value is ReasoningEffort => value !== "auto"),
);

export interface ParsedModelReference {
	providerId: string;
	modelId: string;
	thinkingLevel: ThinkingLevel;
	reasoning?: ReasoningEffort;
}

export function parseModelReference(reference: string): ParsedModelReference {
	const [providerId = "", ...segments] = reference.trim().split("/");
	const possibleReasoning = segments[segments.length - 1] as
		| ReasoningEffort
		| undefined;
	const reasoning =
		possibleReasoning && reasoningEfforts.has(possibleReasoning)
			? possibleReasoning
			: undefined;
	if (reasoning) segments.pop();
	return {
		providerId,
		modelId: segments.join("/"),
		thinkingLevel: reasoning ?? "auto",
		...(reasoning ? { reasoning } : {}),
	};
}

export type SpeechBoundaryType = "WordBoundary" | "SentenceBoundary";

export interface TextToSpeechRequest {
	text: string;
	voice?: string;
	rate?: string;
	volume?: string;
	pitch?: string;
	boundary?: SpeechBoundaryType;
}

export interface SpeechBoundary {
	type: SpeechBoundaryType;
	offset: number;
	duration: number;
	text: string;
}

export interface TextToSpeechResult {
	audio: Blob;
	audioBytes: number;
	boundaries: SpeechBoundary[];
}

export interface SpeechVoice {
	name: string;
	shortName: string;
	gender: string;
	locale: string;
	suggestedCodec: string;
	friendlyName: string;
	status: string;
	contentCategories: string[];
	voicePersonalities: string[];
}
