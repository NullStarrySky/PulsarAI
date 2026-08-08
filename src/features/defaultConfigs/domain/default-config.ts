export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export interface DefaultConfigs {
  defaultChatModel: string;
  reasoningEffort: ReasoningEffort;
  fastModel: string;
  embeddingModel: string;
  imageModel: string;
  speechModel: string;
  transcriptionModel: string;
  promptOptimizationModel: string;
  promptOptimizationPrompt: string;
}

export const defaultConfigKeys = {
  defaultChatModel: "defaultChatModel",
  reasoningEffort: "reasoningEffort",
  fastModel: "fastModel",
  embeddingModel: "embeddingModel",
  imageModel: "imageModel",
  speechModel: "speechModel",
  transcriptionModel: "transcriptionModel",
  promptOptimizationModel: "promptOptimizationModel",
  promptOptimizationPrompt: "promptOptimizationPrompt",
} as const;

export const fallbackDefaultConfigs: DefaultConfigs = {
  defaultChatModel: "openai/gpt-4o-mini",
  reasoningEffort: "none",
  fastModel: "openai/gpt-4o-mini",
  embeddingModel: "",
  imageModel: "",
  speechModel: "edge-tts/edge-tts",
  transcriptionModel: "",
  promptOptimizationModel: "openai/gpt-4o-mini",
  promptOptimizationPrompt: "请将下面的用户输入优化成清晰、具体、可直接执行的提示词。保留原始意图、约束、语言和必要细节，不要回答提示词本身，也不要添加解释。只输出优化后的提示词。\n\n{{prompt}}",
};
