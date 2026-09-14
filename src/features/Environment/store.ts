import { useMagicKeys, useStyleTag } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, watch, watchEffect } from "vue";
import { resetCharacterDataAction } from "@/features/Conversation/clear-data";
import { toggleEditModeAction } from "@/features/Conversation/dataflow/activePathComposable";
import { useRequestDefaults } from "@/features/Request/defaults";
import { host } from "@/host";
import {
	type AppearanceSettings,
	createImportedFont,
	type EnvironmentSettingPage,
	getBuiltInFonts,
	getDefaultAppearance,
	getDefaultHotkeys,
	getDefaultRuntimePreferences,
	getDefaultTranslateSettings,
	getDefaultWebSearchSettings,
	type RuntimePreferences,
	type TranslateState,
	type WebSearchProviderId,
	type WebSearchResult,
	type WebSearchSettings,
	type WindowCloseBehavior,
} from "./defaults";
import { builtInSettingPages } from "./pages";
import { builtInThemes, normalizeImportedTheme } from "./theme/theme-registry";
import { applyTheme, isCssColorDark } from "./utils/theme-dom";
import {
	translateWithLlm,
	translateWithProvider,
} from "./utils/translate-service";

/* -------------------------------------------------------------------------- */
/*                                Pinia Store                                 */
/* -------------------------------------------------------------------------- */

export const useEnvironmentStore = defineStore("environment", () => {
	/* Group 1: 外观 (Appearance) */
	const appearance = ref<AppearanceSettings>(getDefaultAppearance());
	const zenFrameIsDark = ref(true);

	const themes = computed(() => [
		...builtInThemes,
		...appearance.value.customThemes,
	]);
	const fonts = computed(() => [
		...getBuiltInFonts(),
		...appearance.value.customFonts,
	]);
	const activeTheme = computed(
		() =>
			themes.value.find((theme) => theme.id === appearance.value.themeId) ??
			builtInThemes[0],
	);
	const activeFont = computed(
		() =>
			fonts.value.find((font) => font.id === appearance.value.fontId) ??
			getBuiltInFonts()[0],
	);

	const customThemesStyle = useStyleTag("", { id: "pulsarai-custom-themes" });
	const customCssStyle = useStyleTag("", { id: "pulsarai-custom-css" });
	const appearanceVarsStyle = useStyleTag("", {
		id: "pulsarai-appearance-vars",
	});

	function importThemeCss(css: string) {
		if (!css.trim()) throw new Error("主题 CSS 不能为空。");
		const theme = normalizeImportedTheme(css);
		appearance.value.customThemes = [
			...appearance.value.customThemes.filter((item) => item.id !== theme.id),
			theme,
		];
		appearance.value.themeId = theme.id;
		return theme;
	}

	function importFont(name: string, family: string) {
		const font = createImportedFont(name, family);
		appearance.value.customFonts = [
			...appearance.value.customFonts.filter((item) => item.id !== font.id),
			font,
		];
		appearance.value.fontId = font.id;
	}

	function applyAppearance() {
		if (typeof document === "undefined") return;

		customThemesStyle.css.value = [
			...builtInThemes,
			...appearance.value.customThemes,
		]
			.map((theme) => theme.css ?? "")
			.join("\n\n");
		customCssStyle.css.value = appearance.value.customCss;

		appearanceVarsStyle.css.value = `
:root {
  --font-sans: ${activeFont.value.sans};
  --font-serif: ${activeFont.value.serif};
  --font-mono: ${activeFont.value.mono};
  font-size: ${appearance.value.fontSize}px;
  font-family: ${activeFont.value.sans};
  --editor-font-size: ${appearance.value.editorFontSize}px;
  --editor-line-height: ${appearance.value.editorLineHeight}px;
  ${
		appearance.value.frameColorMode === "custom" &&
		appearance.value.frameCustomColor
			? `--zen-frame-bg: ${appearance.value.frameCustomColor}; --zen-frame-border: ${appearance.value.frameCustomColor};`
			: ""
	}
}
body {
  zoom: ${appearance.value.uiScale / 100};
}
`;

		const topBarIsDark = applyTheme(
			activeTheme.value,
			appearance.value.themeMode,
			applyAppearance,
		);

		zenFrameIsDark.value = isCssColorDark(
			appearance.value.zenFrameEnabled
				? "var(--zen-frame-bg)"
				: "var(--background)",
			topBarIsDark,
		);
	}

	/* Group 2: 快捷键 (Hotkeys) */
	const hotkeys = ref<Record<string, string>>(getDefaultHotkeys());

	/* Group 4: 网络搜索 (WebSearch) */
	const webSearchSettings = ref<WebSearchSettings>(
		getDefaultWebSearchSettings(),
	);

	async function webSearch(
		query: string,
		limit?: number,
		provider?: WebSearchProviderId,
	): Promise<WebSearchResult[]> {
		const selectedProvider =
			provider ?? webSearchSettings.value.activeProviderId;
		if (
			selectedProvider === "playwright" &&
			!webSearchSettings.value.playwrightEnabled
		) {
			throw new Error("Playwright 浏览器搜索未启用。");
		}
		if (selectedProvider === "exa" && !webSearchSettings.value.exaEnabled) {
			throw new Error("Exa 搜索未启用。");
		}
		return host.network.webSearch<WebSearchResult[]>({
			query,
			limit: limit ?? webSearchSettings.value.resultLimit,
			provider: selectedProvider,
		});
	}

	/* Group 5: 翻译 (Translate) */
	const translateSettings = ref<TranslateState>(getDefaultTranslateSettings());

	async function translateText(text: string): Promise<string> {
		const state = translateSettings.value;
		if (!state.llmModel) {
			state.llmModel = useRequestDefaults().defaults.fastModel;
		}
		if (state.useLlm) {
			return translateWithLlm(text, state);
		}
		return translateWithProvider(text, state);
	}

	/* Group 6: 运行时 (Runtime Preferences) */
	const runtime = ref<RuntimePreferences>(getDefaultRuntimePreferences());

	/* Unified Auto-persistence Watcher */
	watch(
		[appearance, hotkeys, webSearchSettings, translateSettings, runtime],
		() => {
			void host.config.set("appearance", appearance.value);
			applyAppearance();
			void host.config.set("hotkeys", hotkeys.value);
			void host.config.set("webSearch.settings", webSearchSettings.value);
			void host.config.set("translate", translateSettings.value);
			void host.config.set("runtime", runtime.value);
		},
		{ deep: true },
	);

	/* Group 7: 窗口与设置生命周期 (Window & Lifecycle) */
	const settingsOpen = ref(false);
	const immersiveConversation = ref(false);
	const closeBehavior = ref<WindowCloseBehavior>("ask");
	const closePromptOpen = ref(false);
	const rememberCloseChoice = ref(false);

	function setCloseBehavior(value: WindowCloseBehavior) {
		closeBehavior.value = value;
		void host.config.set("windowCloseBehavior", value);
	}

	async function handleCloseRequest() {
		if (closeBehavior.value === "ask") {
			rememberCloseChoice.value = false;
			closePromptOpen.value = true;
			return;
		}
		await applyCloseChoice(closeBehavior.value);
	}

	function dismissClosePrompt() {
		closePromptOpen.value = false;
		rememberCloseChoice.value = false;
	}

	async function chooseCloseBehavior(
		choice: Exclude<WindowCloseBehavior, "ask">,
	) {
		if (rememberCloseChoice.value) setCloseBehavior(choice);
		closePromptOpen.value = false;
		rememberCloseChoice.value = false;
		await applyCloseChoice(choice);
	}

	async function applyCloseChoice(choice: Exclude<WindowCloseBehavior, "ask">) {
		if (choice === "tray") await host.desktop?.window.hide();
		else await host.desktop?.window.close();
	}

	/* Group 8: 设置页面注册表 (Setting Pages) */
	const settingPages = ref<EnvironmentSettingPage[]>(builtInSettingPages);

	function registerSettingPage(page: EnvironmentSettingPage) {
		const index = settingPages.value.findIndex(
			(item) => item.meta.id === page.meta.id,
		);
		if (index < 0) settingPages.value.push(page);
		else settingPages.value[index] = page;
	}

	/* Shared config facade */
	const config = host.config;

	/* Global initialization */
	async function initialize() {
		const [
			storedAppearance,
			storedHotkeys,
			storedWebSearch,
			storedTranslate,
			storedRuntime,
			storedCloseBehavior,
		] = await Promise.all([
			host.config.get<AppearanceSettings>("appearance"),
			host.config.get<Record<string, string>>("hotkeys"),
			host.config.get<WebSearchSettings>("webSearch.settings"),
			host.config.get<TranslateState>("translate"),
			host.config.get<RuntimePreferences>("runtime"),
			host.config.get<WindowCloseBehavior>("windowCloseBehavior"),
		]);

		if (storedAppearance) Object.assign(appearance.value, storedAppearance);
		if (storedHotkeys) Object.assign(hotkeys.value, storedHotkeys);
		if (storedWebSearch)
			Object.assign(webSearchSettings.value, storedWebSearch);
		if (storedTranslate)
			Object.assign(translateSettings.value, storedTranslate);
		if (storedRuntime) Object.assign(runtime.value, storedRuntime);
		if (storedCloseBehavior) closeBehavior.value = storedCloseBehavior;
		await useRequestDefaults().initialize();

		applyAppearance();
	}

	return {
		/* State Groups */
		appearance,
		hotkeys,
		webSearchSettings,
		translateSettings,
		runtime,

		/* Appearance computed & actions */
		activeFont,
		activeTheme,
		fonts,
		themes,
		zenFrameIsDark,
		importFont,
		importThemeCss,
		applyAppearance,

		/* WebSearch actions */
		webSearch,

		/* Translate actions */
		translateText,

		/* Window & dialog state & actions */
		settingsOpen,
		immersiveConversation,
		closeBehavior,
		closePromptOpen,
		rememberCloseChoice,
		settingPages,
		registerSettingPage,
		setCloseBehavior,
		handleCloseRequest,
		dismissClosePrompt,
		chooseCloseBehavior,

		/* Shared config facade */
		config,
		initialize,
	};
});

/* -------------------------------------------------------------------------- */
/*                           Composable & Functions                           */
/* -------------------------------------------------------------------------- */

export function useEnvironmentHotkeys() {
	const environment = useEnvironmentStore();
	const keys = useMagicKeys({ passive: false });
	watchEffect((onCleanup) => {
		const bindings = [
			[environment.hotkeys.settings, () => (environment.settingsOpen = true)],
			[environment.hotkeys.toggleEditMode, toggleEditModeAction],
			[environment.hotkeys.resetCharacterData, resetCharacterDataAction],
		] as const;
		const stops = bindings.map(([hotkey, run]) =>
			watch(
				() => (hotkey ? keys[hotkey]?.value : false),
				(pressed) => {
					if (pressed) void run();
				},
			),
		);
		onCleanup(() => {
			stops.forEach((stop) => {
				stop();
			});
		});
	});
}
