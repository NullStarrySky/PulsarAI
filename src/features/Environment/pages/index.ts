import { markRaw } from "vue";
import DefaultSettingsPage from "@/features/Request/components/DefaultSettingsPage.vue";
import RequestSettingsPage from "@/features/Request/components/RequestSettingsPage.vue";
import {
	ArchiveRestore,
	Brain,
	ChartNoAxesCombined,
	CreditCard,
	Globe,
	Info,
	Keyboard,
	Languages,
	Palette,
	Settings,
	Star,
} from "@/lib/phosphor-icons";
import BackupSettingsPage from "../backup/BackupSettingsPage.vue";
import type { EnvironmentSettingPage } from "../defaults";
import AboutSettingsPage from "./about/AboutSettingsPage.vue";
import AppearanceSettingsPage from "./appearance/AppearanceSettingsPage.vue";
import ConversationFavoriteSettingsPage from "./favorite/ConversationFavoriteSettingsPage.vue";
import GeneralSettingsPage from "./general/GeneralSettingsPage.vue";
import RuntimeSettingsPage from "./general/RuntimeSettingsPage.vue";
import HotkeySettingsPage from "./hotkey/HotkeySettingsPage.vue";
import StatisticSettingsPage from "./statistic/StatisticSettingsPage.vue";
import SubscriptionSettingsPage from "./subscription/SubscriptionSettingsPage.vue";
import TranslateSettingsPage from "./translate/TranslateSettingsPage.vue";
import WebSearchSettingsPage from "./web-search/WebSearchSettingsPage.vue";

export function createBuiltInSettingPages(): EnvironmentSettingPage[] {
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
			meta: {
				id: "data.backup",
				icon: markRaw(ArchiveRestore),
				title: "版本管理",
			},
			component: markRaw(BackupSettingsPage),
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
			meta: {
				id: "conversation.favorites",
				icon: markRaw(Star),
				title: "消息收藏",
			},
			component: markRaw(ConversationFavoriteSettingsPage),
		},
		{
			meta: {
				id: "account.subscription",
				icon: markRaw(CreditCard),
				title: "订阅方案",
			},
			component: markRaw(SubscriptionSettingsPage),
		},
		{
			meta: { id: "about.app", icon: markRaw(Info), title: "关于" },
			component: markRaw(AboutSettingsPage),
		},
	];
}

export const builtInSettingPages: EnvironmentSettingPage[] =
	createBuiltInSettingPages();
