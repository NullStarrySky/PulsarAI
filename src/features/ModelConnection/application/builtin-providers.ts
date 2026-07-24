import type { ModelProviderDefinition } from "../domain/model-provider";
import { providerIconUrl } from "./provider-icons";

export const builtinModelProviders: ModelProviderDefinition[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "OpenAI 官方接口，适合通用对话、视觉和语音模型。",
    icon: "openai",
    iconUrl: providerIconUrl("openai"),
    baseUrl: "https://api.openai.com/v1",
    apiKeyName: "openai_API_KEY",
    enabled: true,
    builtIn: true,
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
        id: "gpt-4o-mini-tts",
        name: "GPT-4o mini TTS",
        apiType: "tts",
        enabled: false,
      },
      {
        id: "whisper-1",
        name: "Whisper",
        apiType: "asr",
        enabled: false,
      },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek 官方接口，适合对话和推理模型。",
    icon: "deepseek",
    iconUrl: providerIconUrl("deepseek"),
    baseUrl: "https://api.deepseek.com",
    apiKeyName: "deepseek_API_KEY",
    enabled: false,
    builtIn: true,
    models: [
      {
        id: "deepseek-chat",
        name: "DeepSeek Chat",
        apiType: "chat",
        contextSize: 64000,
        enabled: true,
      },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek Reasoner",
        apiType: "chat",
        contextSize: 64000,
        enabled: true,
      },
    ],
  },
];
