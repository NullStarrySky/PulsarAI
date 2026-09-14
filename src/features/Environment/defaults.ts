import type { Component } from "vue";
import type { ModelSelection } from "@/features/Request/types";
import type { ThemeDefinition, ThemeMode } from "./theme/theme-registry";

export type AgentLoadingStyle = "drive" | "dots" | "orbit";
export type WindowCloseBehavior = "ask" | "exit" | "tray";
export type WebSearchProviderId = "playwright" | "exa";
export type TranslationProvider = "microsoft" | "google";

export interface FontDefinition {
	id: string;
	name: string;
	sans: string;
	serif: string;
	mono: string;
}

export interface AppearanceSettings {
	themeId: string;
	themeMode: ThemeMode;
	customThemes: ThemeDefinition[];
	customCss: string;
	fontId: string;
	customFonts: FontDefinition[];
	fontSize: number;
	uiScale: number;
	composerSendWithEnter: boolean;
	interactiveCodePreview: boolean;
	agentLoadingStyle: AgentLoadingStyle;
	zenFrameEnabled: boolean;
	zenFrameWidth: number;
	frameColorMode: "auto" | "custom";
	frameCustomColor: string;
	editorFontSize: number;
	editorLineHeight: number;
	shapeVariant: "square" | "rounded" | "pill";
}

export interface WebSearchSettings {
	activeProviderId: WebSearchProviderId;
	playwrightEnabled: boolean;
	exaEnabled: boolean;
	resultLimit: number;
}

export interface WebSearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface TranslateState {
	sourceLanguage: string;
	targetLanguage: string;
	provider: TranslationProvider;
	azureKey: string;
	azureRegion: string;
	azureEndpoint: string;
	useLlm: boolean;
	llmModel: ModelSelection | null;
	prompt: string;
}

export interface RuntimePreferences {
	playSoundOnReplyComplete: boolean;
	notifyOnReplyComplete: boolean;
	replyCompletionOnlyWhenBackground: boolean;
}

export interface EnvironmentSettingPage {
	meta: { id: string; icon: Component; title: string };
	component?: Component;
	tabs?: Array<{ id: string; title: string; component: Component }>;
}

export const EXA_API_KEY_SECRET = "webSearch.exa.apiKey";

/* -------------------------------------------------------------------------- */
/*                                默认值获取函数                              */
/* -------------------------------------------------------------------------- */

export function getDefaultAppearance(): AppearanceSettings {
	return {
		themeId: "default",
		themeMode: "system",
		customThemes: [],
		customCss: "",
		fontId: "inter",
		customFonts: [],
		fontSize: 16,
		uiScale: 100,
		composerSendWithEnter: true,
		interactiveCodePreview: false,
		agentLoadingStyle: "drive",
		zenFrameEnabled: true,
		zenFrameWidth: 6,
		frameColorMode: "auto",
		frameCustomColor: "#1e1e24",
		editorFontSize: 14,
		editorLineHeight: 16,
		shapeVariant: "rounded",
	};
}

export function getDefaultWebSearchSettings(): WebSearchSettings {
	return {
		activeProviderId: "playwright",
		playwrightEnabled: true,
		exaEnabled: false,
		resultLimit: 5,
	};
}

export function getDefaultTranslateSettings(): TranslateState {
	return {
		sourceLanguage: "auto",
		targetLanguage: "zh-CN",
		provider: "google",
		azureKey: "",
		azureRegion: "",
		azureEndpoint: "https://api.cognitive.microsofttranslator.com",
		useLlm: false,
		llmModel: null,
		prompt:
			"你是专业翻译助手。请把输入内容从 {{sourceLanguage}} 翻译为 {{targetLanguage}}，保留原文格式，不要添加解释。",
	};
}

export function getDefaultHotkeys(): Record<string, string> {
	return {
		settings: "Ctrl+,",
		toggleEditMode: "Ctrl+Shift+E",
		resetCharacterData: "Ctrl+Shift+R",
	};
}

export function getDefaultRuntimePreferences(): RuntimePreferences {
	return {
		playSoundOnReplyComplete: false,
		notifyOnReplyComplete: false,
		replyCompletionOnlyWhenBackground: true,
	};
}

export function getBuiltInFonts(): FontDefinition[] {
	return [
		{
			id: "inter",
			name: "System UI",
			sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
			serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
			mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
		},
		{
			id: "serif",
			name: "Serif Notes",
			sans: 'Georgia, Cambria, "Times New Roman", Times, serif',
			serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
			mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
		},
		{
			id: "mono",
			name: "Mono Workbench",
			sans: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
			serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
			mono: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
		},
	];
}

export function createImportedFont(
	name: string,
	family: string,
): FontDefinition {
	const fonts = getBuiltInFonts();
	return {
		id: `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
		name,
		sans: family,
		serif: family,
		mono: fonts[0].mono,
	};
}

export const environmentHotkeyLabels = {
	settings: { title: "打开设置", description: "打开应用设置。" },
	toggleEditMode: {
		title: "切换编辑子对话模式",
		description: "插入或关闭内联编辑区间。",
	},
	resetCharacterData: {
		title: "清空全部角色数据",
		description: "清空角色包、对话和插件；保留设置、模型和密钥。",
	},
} as const;

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
