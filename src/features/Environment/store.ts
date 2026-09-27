import { useMagicKeys, useStyleTag } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, watch, watchEffect } from "vue";
import { useRequestDefaults } from "@/features/Request/defaults";
import { host } from "@/host";
import {
	type AppearanceSettings,
	createUploadedFont,
	type FontDefinition,
	getBuiltInFonts,
	getDefaultAppearance,
	getDefaultRuntimePreferences,
	getDefaultTranslateSettings,
	getDefaultWebSearchSettings,
	type RuntimePreferences,
	type TranslateState,
	type WebSearchProviderId,
	type WebSearchResult,
	type WebSearchSettings,
} from "./defaults";
import {
	applyHotkeyBindings,
	createEnvironmentHotkeys,
	getHotkeyBindings,
} from "./hotkeys";
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
	const glassEnabled = computed(
		() => Boolean(host.desktop) && host.platform.platform() !== "linux" && appearance.value.windowMaterial !== "none",
	);
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
	watch(
		() => appearance.value.windowMaterial,
		(material) => void host.desktop?.window.setBackgroundMaterial(material),
		{ immediate: true },
	);

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

	async function importFont(file: File) {
		if (!/\.(woff2?|ttf|otf)$/i.test(file.name)) {
			throw new Error("请选择 WOFF、WOFF2、TTF 或 OTF 字体文件。");
		}
		const name = file.name.replace(/\.[^.]+$/, "");
		const font = createUploadedFont(name, await readFileAsDataUrl(file));
		await loadFont(font);
		appearance.value.customFonts = [
			...appearance.value.customFonts.filter((item) => item.id !== font.id),
			font,
		];
		appearance.value.fontId = font.id;
		return font;
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
		void loadFont(activeFont.value);

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
	const hotkeys = ref(createEnvironmentHotkeys());

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
			void host.config.set("hotkeys", getHotkeyBindings(hotkeys.value));
			void host.config.set("webSearch.settings", webSearchSettings.value);
			void host.config.set("translate", translateSettings.value);
			void host.config.set("runtime", runtime.value);
		},
		{ deep: true },
	);

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
		] = await Promise.all([
			host.config.get<AppearanceSettings>("appearance"),
			host.config.get<Record<string, string | null>>("hotkeys"),
			host.config.get<WebSearchSettings>("webSearch.settings"),
			host.config.get<TranslateState>("translate"),
			host.config.get<RuntimePreferences>("runtime"),
		]);

		if (storedAppearance) {
			Object.assign(appearance.value, storedAppearance);
			if (
				!appearance.value.backgroundScope ||
				!Array.isArray(appearance.value.backgroundScope)
			) {
				appearance.value.backgroundScope = [
					"blank",
					"conversation",
					"settings",
				];
			}
		}
		if (storedHotkeys) applyHotkeyBindings(hotkeys.value, storedHotkeys);
		if (storedWebSearch)
			Object.assign(webSearchSettings.value, storedWebSearch);
		if (storedTranslate)
			Object.assign(translateSettings.value, storedTranslate);
		if (storedRuntime) Object.assign(runtime.value, storedRuntime);
		await useRequestDefaults().initialize();

		applyAppearance();
	}

	return {
		/* State Groups */
		appearance,
		glassEnabled,
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

		/* Shared config facade */
		config,
		initialize,
	};
});

const loadedFontIds = new Set<string>();

async function loadFont(font: FontDefinition): Promise<void> {
	if (
		!font.source ||
		loadedFontIds.has(font.id) ||
		typeof document === "undefined"
	)
		return;
	const face = new FontFace(font.name, `url(${JSON.stringify(font.source)})`);
	const loadedFace = await face.load();
	document.fonts.add(loadedFace);
	loadedFontIds.add(font.id);
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () =>
			reject(reader.error ?? new Error(`无法读取字体：${file.name}`));
		reader.onload = () => resolve(String(reader.result));
		reader.readAsDataURL(file);
	});
}

/* -------------------------------------------------------------------------- */
/*                           Composable & Functions                           */
/* -------------------------------------------------------------------------- */

export function useEnvironmentHotkeys() {
	const environment = useEnvironmentStore();
	const keys = useMagicKeys({ passive: false });
	watchEffect((onCleanup) => {
		const stops = Object.values(environment.hotkeys).map((hotkey) =>
			watch(
				() => (hotkey.keyBinding ? keys[hotkey.keyBinding]?.value : false),
				(pressed) => {
					if (pressed) void hotkey.action();
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
