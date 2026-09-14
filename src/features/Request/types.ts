import type { Component } from "vue";

export const TOME = Symbol("tome");
export type Tome = typeof TOME;

export type RequestKind = "text" | "image" | "video" | "speech" | "transcribe";
export type ParamGroup = "basic" | RequestKind | "provider";
export type FunctionalString = string;
export type ComponentString = string;
export type BuiltInFunctionKey = string;
export type BuiltInComponentKey = string;
export type RequestValue = unknown;

export type BuiltInFunctions = Map<BuiltInFunctionKey, Function>;
export type BuiltInComponents = Map<BuiltInComponentKey, Component>;

export interface ParamDefinition {
	/** Dot-separated destination below the request object. */
	paramName: string;
	enableInDefault: boolean;
	title?: string;
	description?: string;
	customBlockComponent?: ComponentString | BuiltInComponentKey;
	paramComponent: {
		component: ComponentString | BuiltInComponentKey;
		componentParam: unknown;
	};
	defaultValue: RequestValue;
	value: RequestValue;
	valueChecker?: FunctionalString | BuiltInFunctionKey;
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

export type ProviderHydrator = FunctionalString | BuiltInFunctionKey;

export interface RequestOverride {
	generateText?: FunctionalString | BuiltInFunctionKey;
	streamText?: FunctionalString | BuiltInFunctionKey;
	generateImage?: FunctionalString | BuiltInFunctionKey;
	generateVideo?: FunctionalString | BuiltInFunctionKey;
	generateSpeech?: FunctionalString | BuiltInFunctionKey;
	transcribe?: FunctionalString | BuiltInFunctionKey;
	ToolLoopAgent?: FunctionalString | BuiltInFunctionKey;
}

export interface Provider {
	id: string;
	name: string;
	description?: string;
	icon?: string;
	enabled: boolean;
	params: Record<ParamGroup, ParamDefinition[]>;
	modelGetter?: FunctionalString | BuiltInFunctionKey;
	models: Record<RequestKind, ModelDefinition[]>;
	/** Builds an AI SDK model from this Provider and the selected model id. */
	hydrator?: ProviderHydrator;
	requestOverride: RequestOverride;
}

export type ParamDefinitionPreset = Map<
	string,
	Record<ParamGroup, ParamDefinition[]>
>;

/** Creation-time templates; providers retain their own mutable definitions. */
export const paramDefinitionPreset: ParamDefinitionPreset = new Map();

export interface ModelSelection {
	providerId: string;
	modelId: string;
	kind: RequestKind;
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
