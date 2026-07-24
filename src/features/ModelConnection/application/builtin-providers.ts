import type { ModelProviderDefinition } from "../domain/model-provider";

export const builtinModelProviders: ModelProviderDefinition[] = [
  {
    id: "openai",
    title: "OpenAI",
    description: "通过 AI SDK OpenAI provider 接入 GPT 系列模型。",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
  },
  {
    id: "deepseek",
    title: "DeepSeek",
    description: "通过 AI SDK DeepSeek provider 接入 DeepSeek Chat/Reasoner。",
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
  },
];
