export interface DefaultConfigs {
	defaultChatModel: string;
	fastModel: string;
	embeddingModel: string;
	imageModel: string;
	speechModel: string;
	transcriptionModel: string;
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
	sttLanguage: "auto",
	sttAutoPolish: false,
	sttPolishModel: "openai/gpt-4o-mini",
	sttPolishPrompt:
		"你是一个语音识别文本润色助手。请对以下语音识别出来的文本进行润色，修正错别字、口语停顿和标点符号，保持原意，直接输出润色后的文本，不要输出任何多余的解释。文本：\n{{text}}",
};
