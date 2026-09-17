import { providerIconUrl } from "./provider-icons";

export type ModelApiType =
	| "chat"
	| "image"
	| "video"
	| "embedding"
	| "asr"
	| "tts";

export interface CatalogModel {
	id: string;
	name: string;
	apiType: ModelApiType;
	contextSize?: number;
	knowledgeCutoff?: string;
	iconUrl?: string;
	enabled: boolean;
}

export interface ModelProviderDefinition {
	id: string;
	name: string;
	description?: string;
	icon?: string;
	iconUrl?: string;
	baseUrl: string;
	apiKeyName: string;
	enabled: boolean;
	builtIn?: boolean;
	runtime?: "remote" | "local-heavy";
	transport?: "ai-sdk" | "openai-compatible";
	modelGetter?: string;
	models: CatalogModel[];
}

function nativeProvider(
	id: string,
	name: string,
	description: string,
	baseUrl = "",
	modelGetter?: string,
): ModelProviderDefinition {
	return {
		id,
		name,
		description,
		icon: id,
		iconUrl: providerIconUrl(id),
		baseUrl,
		apiKeyName: `${id.replace(/-/g, "_")}_API_KEY`,
		enabled: false,
		builtIn: true,
		runtime: "remote",
		transport: "ai-sdk",
		...(modelGetter ? { modelGetter } : {}),
		models: [],
	};
}

export const builtinModelProviders: ModelProviderDefinition[] = [
	{
		...nativeProvider(
			"openai",
			"OpenAI",
			"OpenAI 官方 AI SDK Provider。",
			"https://api.openai.com/v1",
			"listOpenAIModels",
		),
		enabled: true,
		models: [
			{
				id: "gpt-4o",
				name: "GPT-4o",
				apiType: "chat",
				contextSize: 128000,
				enabled: true,
			},
			{
				id: "gpt-4o-mini",
				name: "GPT-4o mini",
				apiType: "chat",
				contextSize: 128000,
				enabled: true,
			},
			{
				id: "text-embedding-3-small",
				name: "Text Embedding 3 Small",
				apiType: "embedding",
				enabled: true,
			},
			{
				id: "gpt-image-2",
				name: "GPT Image 2",
				apiType: "image",
				enabled: false,
			},
			{
				id: "gpt-4o-mini-tts",
				name: "GPT-4o mini TTS",
				apiType: "tts",
				enabled: false,
			},
			{ id: "whisper-1", name: "Whisper", apiType: "asr", enabled: false },
		],
	},
	{
		...nativeProvider(
			"deepseek",
			"DeepSeek",
			"DeepSeek 官方 AI SDK Provider，支持结构化 reasoning 流。",
			"https://api.deepseek.com",
		),
		models: [
			{
				id: "deepseek-v4-flash",
				name: "DeepSeek V4 Flash",
				apiType: "chat",
				contextSize: 64000,
				enabled: true,
			},
			{
				id: "deepseek-v4-pro",
				name: "DeepSeek V4 Pro",
				apiType: "chat",
				contextSize: 64000,
				enabled: true,
			},
		],
	},
	nativeProvider("xai", "xAI Grok", "xAI Grok 官方 AI SDK Provider。"),
	nativeProvider(
		"azure",
		"Azure OpenAI",
		"Azure OpenAI 官方 AI SDK Provider。",
	),
	nativeProvider("anthropic", "Anthropic", "Anthropic 官方 AI SDK Provider。"),
	nativeProvider(
		"amazon-bedrock",
		"Amazon Bedrock",
		"Amazon Bedrock 官方 AI SDK Provider。",
	),
	nativeProvider("google", "Google", "Google Gemini 官方 AI SDK Provider。"),
	nativeProvider("mistral", "Mistral", "Mistral 官方 AI SDK Provider。"),
	nativeProvider(
		"togetherai",
		"Together.ai",
		"Together.ai 官方 AI SDK Provider。",
	),
	nativeProvider("cohere", "Cohere", "Cohere 官方 AI SDK Provider。"),
	nativeProvider("fireworks", "Fireworks", "Fireworks 官方 AI SDK Provider。"),
	nativeProvider("deepinfra", "DeepInfra", "DeepInfra 官方 AI SDK Provider。"),
	nativeProvider("cerebras", "Cerebras", "Cerebras 官方 AI SDK Provider。"),
	nativeProvider("groq", "Groq", "Groq 官方 AI SDK Provider。"),
	nativeProvider(
		"perplexity",
		"Perplexity",
		"Perplexity 官方 AI SDK Provider。",
	),
	nativeProvider(
		"elevenlabs",
		"ElevenLabs",
		"ElevenLabs 官方 AI SDK Provider。",
	),
	nativeProvider("lmnt", "LMNT", "LMNT 官方 AI SDK Provider。"),
	nativeProvider("hume", "Hume", "Hume 官方 AI SDK Provider。"),
	nativeProvider("revai", "Rev.ai", "Rev.ai 官方 AI SDK Provider。"),
	nativeProvider("deepgram", "Deepgram", "Deepgram 官方 AI SDK Provider。"),
	nativeProvider("gladia", "Gladia", "Gladia 官方 AI SDK Provider。"),
	nativeProvider(
		"assemblyai",
		"AssemblyAI",
		"AssemblyAI 官方 AI SDK Provider。",
	),
	nativeProvider("baseten", "Baseten", "Baseten 官方 AI SDK Provider。"),
];
