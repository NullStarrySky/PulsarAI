export type ModelApiType = "chat" | "image" | "video" | "embedding" | "asr" | "tts";
export type ModelProviderRuntime = "remote" | "local-heavy";

export type ModelCapability =
  | "audio"
  | "files"
  | "functionCall"
  | "imageOutput"
  | "reasoning"
  | "search"
  | "structuredOutput"
  | "video"
  | "vision";

/** A capability is only recorded when the provider explicitly declares support. */
export type ModelCapabilities = Partial<Record<ModelCapability, boolean>>;

export type ModelPriceCurrency = "CNY" | "USD";
export type ModelPriceUnit = "millionTokens" | "millionCharacters" | "image" | "video" | "megapixel" | "second";

export interface FixedModelPricingUnit {
  name: string;
  strategy: "fixed";
  unit: ModelPriceUnit;
  rate: number;
  originalRate?: number;
}

export interface TieredModelPricingUnit {
  name: string;
  strategy: "tiered";
  unit: ModelPriceUnit;
  tiers: Array<{ rate: number; originalRate?: number; upTo: number | "infinity" }>;
}

export interface LookupModelPricingUnit {
  name: string;
  strategy: "lookup";
  unit: ModelPriceUnit;
  lookup: {
    prices: Record<string, number>;
    originalPrices?: Record<string, number>;
    pricingParams: string[];
  };
}

export interface ModelPricing {
  currency?: ModelPriceCurrency;
  units: Array<FixedModelPricingUnit | TieredModelPricingUnit | LookupModelPricingUnit>;
  approximatePricePerImage?: number;
  approximatePricePerVideo?: number;
  audioTokensPerSecond?: number;
}

export interface ModelDefinition {
  id: string;
  name: string;
  apiType: ModelApiType;
  contextSize?: number;
  maxOutput?: number;
  capabilities?: ModelCapabilities;
  /** Provider-specific model options retained from the configuration catalog. */
  parameters?: Record<string, unknown>;
  pricing?: ModelPricing;
  /** Model-provider declared reliable knowledge cutoff, normally YYYY-MM. */
  knowledgeCutoff?: string;
  releasedAt?: string;
  family?: string;
  generation?: string;
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
  /** Heavy local runtimes are persisted for future support but hidden from media-service Features. */
  runtime?: ModelProviderRuntime;
  /** Native AI SDK package metadata or the generic OpenAI-compatible fallback. */
  transport?: "ai-sdk" | "openai-compatible";
  models: ModelDefinition[];
}

export function supportsFeatureService(provider: ModelProviderDefinition) {
  return provider.runtime !== "local-heavy";
}

export interface NewModelProviderInput {
  id: string;
  name?: string;
  description?: string;
  iconUrl?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface NewModelInput {
  id: string;
  name?: string;
  apiType: ModelApiType;
  contextSize?: number;
  iconUrl?: string;
  capabilities?: ModelCapabilities;
  pricing?: ModelPricing;
  knowledgeCutoff?: string;
}
