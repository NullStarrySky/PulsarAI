export interface DefaultConfigs {
  defaultChatModel: string;
  fastModel: string;
  embeddingModel: string;
  imageModel: string;
}

export const defaultConfigKeys = {
  defaultChatModel: "defaultChatModel",
  fastModel: "fastModel",
  embeddingModel: "embeddingModel",
  imageModel: "imageModel",
} as const;

export const fallbackDefaultConfigs: DefaultConfigs = {
  defaultChatModel: "openai/gpt-4o-mini",
  fastModel: "openai/gpt-4o-mini",
  embeddingModel: "",
  imageModel: "",
};
