import {
  embed as baseEmbed,
  embedMany as baseEmbedMany,
  generateImage as baseGenerateImage,
  generateObject as baseGenerateObject,
  generateSpeech as baseGenerateSpeech,
  generateText as baseGenerateText,
  streamObject as baseStreamObject,
  streamText as baseStreamText,
  transcribe as baseTranscribe,
  type EmbeddingModel,
  type ImageModel,
  type LanguageModel,
  type SpeechModel,
  type TranscriptionModel,
} from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { modelProxyFetch } from "../infrastructure/model-proxy-fetch";
import { HuggingFaceImageModel } from "../infrastructure/huggingface-image-model";
import { parseModelReference } from "../domain/model-reference";

export type HydratableModel = string | LanguageModel | ImageModel | EmbeddingModel | TranscriptionModel | SpeechModel;
export type ModelKind = "chat" | "image" | "embedding" | "asr" | "tts";

interface ProviderHydrationConfig {
  baseURL: string;
  apiKeyName: string;
  kindMap: Partial<Record<ModelKind, "default" | "chat" | "image" | "embedding" | "transcription" | "speech">>;
}

type ProviderBuilder = (config: ProviderHydrationConfig) => Record<string, (modelId: string) => unknown>;

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
    kindMap: {
      chat: "chat",
    },
  },
};

const providerBuilders: Record<string, ProviderBuilder> = {
  openai: (config) => {
    const provider = createOpenAI({
      apiKey: `<<${config.apiKeyName}>>`,
      baseURL: config.baseURL,
      fetch: modelProxyFetch,
    });

    return {
      default: (modelId: string) => provider(modelId),
      chat: (modelId: string) => provider.chat(modelId),
      image: (modelId: string) => provider.image(modelId),
      embedding: (modelId: string) => provider.embedding(modelId),
      transcription: (modelId: string) => provider.transcription(modelId),
      speech: (modelId: string) => provider.speech(modelId),
    };
  },
  deepseek: (config) => {
    const provider = createDeepSeek({
      apiKey: `<<${config.apiKeyName}>>`,
      baseURL: config.baseURL,
      fetch: modelProxyFetch,
    });

    return {
      default: (modelId: string) => provider(modelId),
      chat: (modelId: string) => provider.chat(modelId),
    };
  },
  huggingface: (config) => ({
    image: (modelId: string) => new HuggingFaceImageModel(modelId, config.apiKeyName, config.baseURL),
  }),
};

export function registerProviderHydration(
  providerId: string,
  config: ProviderHydrationConfig,
  builder: ProviderBuilder,
) {
  providerConfigs[providerId] = config;
  providerBuilders[providerId] = builder;
}

export function registerOpenAICompatibleProvider(providerId: string, baseURL: string, apiKeyName: string) {
  if (providerId === "huggingface") {
    providerConfigs[providerId] = { baseURL, apiKeyName, kindMap: { image: "image" } };
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
  providerBuilders[providerId] = providerBuilders.openai;
}

export function unregisterProviderHydration(providerId: string) {
  if (providerId === "openai" || providerId === "deepseek") return;
  delete providerConfigs[providerId];
  delete providerBuilders[providerId];
}

export function hydrateModel(model: HydratableModel, kind: ModelKind = "chat") {
  if (typeof model !== "string") {
    return model;
  }

  const { providerId, modelId } = parseModelReference(model);
  const config = providerConfigs[providerId];
  const builder = providerBuilders[providerId];

  if (!providerId || !modelId || !config || !builder) {
    throw new Error(`Unknown model reference: ${model}`);
  }

  const provider = builder(config);
  const factoryName = config.kindMap[kind] ?? "default";
  const factory = provider[factoryName];

  if (!factory) {
    throw new Error(`Provider ${providerId} does not support ${kind} models.`);
  }

  return factory(modelId);
}

type WithModel<T> = T extends { model: unknown } ? Omit<T, "model"> & { model: HydratableModel } : T;

function hydrateChatOptions<T extends { model: HydratableModel }>(options: T) {
  const input = options as T & { reasoning?: unknown };
  const parsed = typeof options.model === "string" ? parseModelReference(options.model) : null;
  return {
    ...options,
    ...(parsed?.reasoning && input.reasoning === undefined
      ? { reasoning: parsed.reasoning }
      : {}),
    model: hydrateModel(options.model, "chat") as LanguageModel,
  };
}

export function generateText(options: WithModel<Parameters<typeof baseGenerateText>[0]>) {
  return baseGenerateText(hydrateChatOptions(options));
}

export function streamText(options: WithModel<Parameters<typeof baseStreamText>[0]>) {
  return baseStreamText(hydrateChatOptions(options));
}

export function generateObject(options: WithModel<Parameters<typeof baseGenerateObject>[0]>) {
  return baseGenerateObject(hydrateChatOptions(options));
}

export function streamObject(options: WithModel<Parameters<typeof baseStreamObject>[0]>) {
  return baseStreamObject(hydrateChatOptions(options));
}

export function embed(options: WithModel<Parameters<typeof baseEmbed>[0]>) {
  return baseEmbed({
    ...options,
    model: hydrateModel(options.model, "embedding") as EmbeddingModel,
  });
}

export function embedMany(options: WithModel<Parameters<typeof baseEmbedMany>[0]>) {
  return baseEmbedMany({
    ...options,
    model: hydrateModel(options.model, "embedding") as EmbeddingModel,
  });
}

export function generateImage(options: WithModel<Parameters<typeof baseGenerateImage>[0]>) {
  return baseGenerateImage({
    ...options,
    model: hydrateModel(options.model, "image") as ImageModel,
  });
}

export function transcribe(options: WithModel<Parameters<typeof baseTranscribe>[0]>) {
  return baseTranscribe({
    ...options,
    model: hydrateModel(options.model, "asr") as TranscriptionModel,
  });
}

export function generateSpeech(options: WithModel<Parameters<typeof baseGenerateSpeech>[0]>) {
  return baseGenerateSpeech({
    ...options,
    model: hydrateModel(options.model, "tts") as SpeechModel,
  });
}

export * from "ai";
