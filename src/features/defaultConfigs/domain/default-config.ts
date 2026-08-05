export interface DefaultConfigs {
  defaultChatModel: string;
  fastModel: string;
  embeddingModel: string;
  imageModel: string;
  speechModel: string;
  transcriptionModel: string;
}

export const defaultConfigKeys = {
  defaultChatModel: "defaultChatModel",
  fastModel: "fastModel",
  embeddingModel: "embeddingModel",
  imageModel: "imageModel",
  speechModel: "speechModel",
  transcriptionModel: "transcriptionModel",
} as const;

export const fallbackDefaultConfigs: DefaultConfigs = {
  defaultChatModel: "openai/gpt-4o-mini",
  fastModel: "openai/gpt-4o-mini",
  embeddingModel: "",
  imageModel: "",
  speechModel: "edge-tts/edge-tts",
  transcriptionModel: "",
};
