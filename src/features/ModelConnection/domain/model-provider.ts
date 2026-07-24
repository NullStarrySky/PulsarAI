export type BuiltinModelProviderId = "openai" | "deepseek";

export interface ModelProviderDefinition {
  id: BuiltinModelProviderId;
  title: string;
  description: string;
  baseUrl: string;
  defaultModel: string;
}

export interface ModelProviderConnection {
  providerId: BuiltinModelProviderId;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
}
