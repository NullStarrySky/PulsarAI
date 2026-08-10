export interface DefaultConfigs {
  defaultChatModel: string;
  fastModel: string;
  embeddingModel: string;
  imageModel: string;
  speechModel: string;
  transcriptionModel: string;
  promptOptimizationModel: string;
  promptOptimizationPrompt: string;
  sttLanguage: string;
  sttAutoPolish: boolean;
  sttPolishModel: string;
  sttPolishPrompt: string;
}

export const defaultConfigKeys = {
  defaultChatModel: "defaultChatModel",
  fastModel: "fastModel",
  embeddingModel: "embeddingModel",
  imageModel: "imageModel",
  speechModel: "speechModel",
  transcriptionModel: "transcriptionModel",
  promptOptimizationModel: "promptOptimizationModel",
  promptOptimizationPrompt: "promptOptimizationPrompt",
  sttLanguage: "sttLanguage",
  sttAutoPolish: "sttAutoPolish",
  sttPolishModel: "sttPolishModel",
  sttPolishPrompt: "sttPolishPrompt",
} as const;

export const fallbackDefaultConfigs: DefaultConfigs = {
  defaultChatModel: "openai/gpt-4o-mini",
  fastModel: "openai/gpt-4o-mini",
  embeddingModel: "",
  imageModel: "",
  speechModel: "edge-tts/edge-tts",
  transcriptionModel: "",
  promptOptimizationModel: "openai/gpt-4o-mini",
  promptOptimizationPrompt: "请将下面的用户输入优化成清晰、具体、可直接执行的提示词。保留原始意图、约束、语言和必要细节，不要回答提示词本身，也不要添加解释。只输出优化后的提示词。\n\n{{prompt}}",
  sttLanguage: "auto",
  sttAutoPolish: false,
  sttPolishModel: "openai/gpt-4o-mini",
  sttPolishPrompt: "你是一个语音识别文本润色助手。请对以下语音识别出来的文本进行润色，修正错别字、口语停顿和标点符号，保持原意，直接输出润色后的文本，不要输出任何多余的解释。文本：\n{{text}}",
};
