import { type Component, markRaw } from "vue";
import AboutSettingsPage from "@/features/Environment/pages/about/AboutSettingsPage.vue";
import AppearanceSettingsPage from "@/features/Environment/pages/appearance/AppearanceSettingsPage.vue";
import GeneralSettingsPage from "@/features/Environment/pages/general/GeneralSettingsPage.vue";
import RuntimeSettingsPage from "@/features/Environment/pages/general/RuntimeSettingsPage.vue";
import HotkeySettingsPage from "@/features/Environment/pages/hotkey/HotkeySettingsPage.vue";
import StatisticSettingsPage from "@/features/Environment/pages/statistic/StatisticSettingsPage.vue";
import TranslateSettingsPage from "@/features/Environment/pages/translate/TranslateSettingsPage.vue";
import WebSearchSettingsPage from "@/features/Environment/pages/web-search/WebSearchSettingsPage.vue";
import DefaultSettingsPage from "@/features/Request/components/DefaultSettingsPage.vue";
import RequestSettingsPage from "@/features/Request/components/RequestSettingsPage.vue";
import {
	Brain,
	ChartNoAxesCombined,
	Globe,
	Info,
	Keyboard,
	Languages,
	Palette,
	Settings,
} from "@/lib/phosphor-icons";

export interface UISettingPage {
	meta: { id: string; icon: Component; title: string };
	component?: Component;
	tabs?: Array<{ id: string; title: string; component: Component }>;
}

export function createBuiltInSettingPages(): UISettingPage[] {
	return [
		{
			meta: { id: "general", icon: markRaw(Settings), title: "通用" },
			tabs: [
				{
					id: "application",
					title: "应用",
					component: markRaw(GeneralSettingsPage),
				},
				{
					id: "defaults",
					title: "默认项",
					component: markRaw(DefaultSettingsPage),
				},
				{
					id: "runtime",
					title: "运行时",
					component: markRaw(RuntimeSettingsPage),
				},
			],
		},
		{
			meta: { id: "appearance.theme", icon: markRaw(Palette), title: "主题" },
			component: markRaw(AppearanceSettingsPage),
		},
		{
			meta: { id: "provider.models", icon: markRaw(Brain), title: "模型" },
			component: markRaw(RequestSettingsPage),
		},
		{
			meta: { id: "tools.hotkey", icon: markRaw(Keyboard), title: "快捷键" },
			component: markRaw(HotkeySettingsPage),
		},
		{
			meta: {
				id: "provider.web-search",
				icon: markRaw(Globe),
				title: "网络搜索",
			},
			component: markRaw(WebSearchSettingsPage),
		},
		{
			meta: { id: "tools.translate", icon: markRaw(Languages), title: "翻译" },
			component: markRaw(TranslateSettingsPage),
		},
		{
			meta: {
				id: "data.statistic",
				icon: markRaw(ChartNoAxesCombined),
				title: "数据统计",
			},
			component: markRaw(StatisticSettingsPage),
		},
		{
			meta: { id: "about.app", icon: markRaw(Info), title: "关于" },
			component: markRaw(AboutSettingsPage),
		},
	];
}

export const builtInSettingPages: UISettingPage[] = createBuiltInSettingPages();
