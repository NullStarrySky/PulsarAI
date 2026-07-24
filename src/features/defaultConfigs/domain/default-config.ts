export interface DefaultConfigs {
  defaultChatModel: string;
}

export const defaultConfigKeys = {
  defaultChatModel: "defaultChatModel",
} as const;

export const fallbackDefaultConfigs: DefaultConfigs = {
  defaultChatModel: "openai/gpt-4o-mini",
};
