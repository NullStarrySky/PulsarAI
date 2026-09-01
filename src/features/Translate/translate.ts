type TranslationProvider = "microsoft" | "google";

export interface TranslateState {
	sourceLanguage: string;
	targetLanguage: string;
	provider: TranslationProvider;
	azureKey: string;
	azureRegion: string;
	azureEndpoint: string;
	useLlm: boolean;
	llmModel: string;
	prompt: string;
}

export const translateLanguages = [
	{ id: "auto", name: "自动检测" },
	{ id: "zh-CN", name: "简体中文" },
	{ id: "zh-TW", name: "繁体中文" },
	{ id: "en", name: "English" },
	{ id: "ja", name: "日本語" },
	{ id: "ko", name: "한국어" },
	{ id: "fr", name: "Français" },
	{ id: "de", name: "Deutsch" },
	{ id: "es", name: "Español" },
	{ id: "ru", name: "Русский" },
];

export function createDefaultTranslateState(): TranslateState {
	return {
		sourceLanguage: "auto",
		targetLanguage: "zh-CN",
		provider: "google",
		azureKey: "",
		azureRegion: "",
		azureEndpoint: "https://api.cognitive.microsofttranslator.com",
		useLlm: false,
		llmModel: "",
		prompt:
			"你是专业翻译助手。请把输入内容从 {{sourceLanguage}} 翻译为 {{targetLanguage}}，保留原文格式，不要添加解释。",
	};
}
