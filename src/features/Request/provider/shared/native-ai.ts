import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAssemblyAI } from "@ai-sdk/assemblyai";
import { createAzure } from "@ai-sdk/azure";
import { createBaseten } from "@ai-sdk/baseten";
import { createCerebras } from "@ai-sdk/cerebras";
import { createCohere } from "@ai-sdk/cohere";
import { createDeepgram } from "@ai-sdk/deepgram";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createElevenLabs } from "@ai-sdk/elevenlabs";
import { createFireworks } from "@ai-sdk/fireworks";
import { createGladia } from "@ai-sdk/gladia";
import { createGoogle } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createHume } from "@ai-sdk/hume";
import { createLMNT } from "@ai-sdk/lmnt";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createPerplexity } from "@ai-sdk/perplexity";
import { createRevai } from "@ai-sdk/revai";
import { createTogetherAI } from "@ai-sdk/togetherai";
import { createXai } from "@ai-sdk/xai";
import type {
	generateImage as baseGenerateImage,
	EmbeddingModel,
	ImageModel,
	LanguageModel,
	SpeechModel,
	TranscriptionModel,
} from "ai";
import { modelProxyFetch } from "./custom-fetch";
import { HuggingFaceImageModel } from "./huggingface-image-model";

export type HydratableModel =
	| string
	| LanguageModel
	| ImageModel
	| EmbeddingModel
	| TranscriptionModel
	| SpeechModel;
export type ModelKind = "chat" | "image" | "embedding" | "asr" | "tts";
export type GenerateImageResult = Awaited<ReturnType<typeof baseGenerateImage>>;

interface ProviderHydrationConfig {
	baseURL: string;
	apiKeyName: string;
	kindMap: Partial<
		Record<
			ModelKind,
			"default" | "chat" | "image" | "embedding" | "transcription" | "speech"
		>
	>;
}

type ProviderFactory = { [name: string]: unknown } & ((
	modelId: string,
) => unknown);
type ProviderBuilder = (
	config: ProviderHydrationConfig,
) => Record<string, (modelId: string) => unknown>;

function createNativeProviderBuilder(
	createProvider: unknown,
	extraSettings?: (config: ProviderHydrationConfig) => Record<string, unknown>,
): ProviderBuilder {
	return (config) => {
		const provider = (
			createProvider as (settings: Record<string, unknown>) => ProviderFactory
		)({
			apiKey: `<<${config.apiKeyName}>>`,
			...(config.baseURL ? { baseURL: config.baseURL } : {}),
			fetch: modelProxyFetch,
			...extraSettings?.(config),
		});
		const create =
			(...names: string[]) =>
			(modelId: string) => {
				for (const name of names) {
					const factory = provider[name];
					if (typeof factory === "function") {
						return factory.call(provider, modelId);
					}
				}
				if (typeof provider === "function") {
					return provider(modelId);
				}
				throw new Error(`Provider does not implement ${names.join(" / ")}.`);
			};

		return {
			default: create("languageModel", "chat", "chatModel"),
			chat: create("chat", "chatModel", "languageModel"),
			image: create("image", "imageModel"),
			embedding: create("embedding", "embeddingModel", "textEmbeddingModel"),
			transcription: create("transcription", "transcriptionModel"),
			speech: create("speech", "speechModel"),
		};
	};
}

const nativeProviderBuilders: Record<string, ProviderBuilder> = {
	openai: createNativeProviderBuilder(createOpenAI),
	azure: createNativeProviderBuilder(createAzure),
	anthropic: createNativeProviderBuilder(createAnthropic),
	"amazon-bedrock": createNativeProviderBuilder(createAmazonBedrock),
	google: createNativeProviderBuilder(createGoogle),
	mistral: createNativeProviderBuilder(createMistral),
	togetherai: createNativeProviderBuilder(createTogetherAI),
	cohere: createNativeProviderBuilder(createCohere),
	fireworks: createNativeProviderBuilder(createFireworks),
	deepinfra: createNativeProviderBuilder(createDeepInfra),
	deepseek: createNativeProviderBuilder(createDeepSeek),
	cerebras: createNativeProviderBuilder(createCerebras),
	groq: createNativeProviderBuilder(createGroq),
	perplexity: createNativeProviderBuilder(createPerplexity),
	elevenlabs: createNativeProviderBuilder(createElevenLabs),
	lmnt: createNativeProviderBuilder(createLMNT),
	hume: createNativeProviderBuilder(createHume),
	revai: createNativeProviderBuilder(createRevai),
	deepgram: createNativeProviderBuilder(createDeepgram),
	gladia: createNativeProviderBuilder(createGladia),
	assemblyai: createNativeProviderBuilder(createAssemblyAI),
	baseten: createNativeProviderBuilder(createBaseten),
	xai: createNativeProviderBuilder(createXai),
};

const providerConfigs: Record<string, ProviderHydrationConfig> = {
	openai: {
		baseURL: "https://api.openai.com/v1",
		apiKeyName: "openai_API_KEY",
		kindMap: {
			chat: "chat",
			image: "image",
			embedding: "embedding",
			asr: "transcription",
			tts: "speech",
		},
	},
	deepseek: {
		baseURL: "https://api.deepseek.com",
		apiKeyName: "deepseek_API_KEY",
		kindMap: { chat: "chat" },
	},
};

const providerBuilders: Record<string, ProviderBuilder> = {
	...nativeProviderBuilders,
	huggingface: (config) => ({
		image: (modelId: string) =>
			new HuggingFaceImageModel(modelId, config.apiKeyName, config.baseURL),
	}),
};

export function registerProviderHydration(provider: {
	id: string;
	baseUrl: string;
	apiKeyName: string;
	transport?: "ai-sdk" | "openai-compatible";
}) {
	const builder =
		provider.transport === "ai-sdk"
			? nativeProviderBuilders[provider.id]
			: undefined;
	if (builder) {
		providerConfigs[provider.id] = {
			baseURL: provider.baseUrl,
			apiKeyName: provider.apiKeyName,
			kindMap: {
				chat: "chat",
				image: "image",
				embedding: "embedding",
				asr: "transcription",
				tts: "speech",
			},
		};
		providerBuilders[provider.id] = builder;
		return;
	}

	registerOpenAICompatibleProvider(
		provider.id,
		provider.baseUrl,
		provider.apiKeyName,
	);
}

function registerOpenAICompatibleProvider(
	providerId: string,
	baseURL: string,
	apiKeyName: string,
) {
	if (providerId === "huggingface") {
		providerConfigs[providerId] = {
			baseURL,
			apiKeyName,
			kindMap: { image: "image" },
		};
		providerBuilders[providerId] = providerBuilders.huggingface;
		return;
	}
	providerConfigs[providerId] = {
		baseURL,
		apiKeyName,
		kindMap: {
			chat: "chat",
			image: "image",
			embedding: "embedding",
			asr: "transcription",
			tts: "speech",
		},
	};
	providerBuilders[providerId] = createNativeProviderBuilder(
		createOpenAICompatible,
		() => ({ name: providerId }),
	);
}

export function unregisterProviderHydration(providerId: string) {
	if (nativeProviderBuilders[providerId] || providerId === "huggingface")
		return;
	delete providerConfigs[providerId];
	delete providerBuilders[providerId];
}

export function hydrateModel(model: HydratableModel, kind: ModelKind = "chat") {
	if (typeof model !== "string") return model;

	const [providerId = "", ...modelSegments] = model.split("/");
	const modelId = modelSegments.join("/");
	const config = providerConfigs[providerId];
	const builder = providerBuilders[providerId];
	if (!providerId || !modelId || !config || !builder) {
		throw new Error(`Unknown model reference: ${model}`);
	}

	const factory = builder(config)[config.kindMap[kind] ?? "default"];
	if (!factory)
		throw new Error(`Provider ${providerId} does not support ${kind} models.`);
	return factory(modelId);
}
