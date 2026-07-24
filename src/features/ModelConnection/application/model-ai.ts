import {
  embed as baseEmbed,
  embedMany as baseEmbedMany,
  generateImage as baseGenerateImage,
  generateObject as baseGenerateObject,
  generateText as baseGenerateText,
  streamObject as baseStreamObject,
  streamText as baseStreamText,
  transcribe as baseTranscribe,
  type EmbeddingModel,
  type ImageModel,
  type LanguageModel,
  type TranscriptionModel,
} from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { modelProxyFetch } from "../infrastructure/model-proxy-fetch";

export type HydratableModel = string | LanguageModel | ImageModel | EmbeddingModel | TranscriptionModel;
export type ModelKind = "chat" | "image" | "embedding" | "asr";

interface ProviderHydrationConfig {
  baseURL: string;
  apiKeyName: string;
  kindMap: Partial<Record<ModelKind, "default" | "chat" | "image" | "embedding" | "transcription">>;
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
  providerConfigs[providerId] = {
    baseURL,
    apiKeyName,
    kindMap: {
      chat: "chat",
      image: "image",
      embedding: "embedding",
      asr: "transcription",
    },
  };
  providerBuilders[providerId] = providerBuilders.openai;
}

export function hydrateModel(model: HydratableModel, kind: ModelKind = "chat") {
  if (typeof model !== "string") {
    return model;
  }

  const [providerId, ...modelIdParts] = model.split("/");
  const modelId = modelIdParts.join("/");
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

export function generateText(options: WithModel<Parameters<typeof baseGenerateText>[0]>) {
  return baseGenerateText({
    ...options,
    model: hydrateModel(options.model, "chat") as LanguageModel,
  });
}

export function streamText(options: WithModel<Parameters<typeof baseStreamText>[0]>) {
  return baseStreamText({
    ...options,
    model: hydrateModel(options.model, "chat") as LanguageModel,
  });
}

export function generateObject(options: WithModel<Parameters<typeof baseGenerateObject>[0]>) {
  return baseGenerateObject({
    ...options,
    model: hydrateModel(options.model, "chat") as LanguageModel,
  });
}

export function streamObject(options: WithModel<Parameters<typeof baseStreamObject>[0]>) {
  return baseStreamObject({
    ...options,
    model: hydrateModel(options.model, "chat") as LanguageModel,
  });
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

export * from "ai";
