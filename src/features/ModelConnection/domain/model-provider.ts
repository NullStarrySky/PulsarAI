export type ModelApiType = "chat" | "image" | "video" | "embedding" | "asr" | "tts";

export interface ModelDefinition {
  id: string;
  name: string;
  apiType: ModelApiType;
  contextSize?: number;
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
  models: ModelDefinition[];
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
}
