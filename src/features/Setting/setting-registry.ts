import {
	BarChart3,
	Brain,
	CreditCard,
	Globe,
	History,
	ImageIcon,
	Info,
	Keyboard,
	Languages,
	Mic,
	Palette,
	Settings,
	Star,
	Volume2,
} from "lucide-vue-next";
import type { Component } from "vue";
import BackupSettingsPage from "@/features/Backup/BackupSettingsPage.vue";
import DefaultConfigSettingsPage from "@/features/defaultConfigs/DefaultConfigSettingsPage.vue";
import HotkeySettingsPage from "@/features/Hotkey/HotkeySettingsPage.vue";
import ImageGenerationSettingsPage from "@/features/ImageGeneration/ImageGenerationSettingsPage.vue";
import RuntimeSettingsPage from "@/features/Misc/RuntimeSettingsPage.vue";
import ModelProviderSettingsPage from "@/features/ModelConnection/components/ModelProviderSettingsPage.vue";
import AboutSettingsPage from "@/features/Setting/components/pages/AboutSettingsPage.vue";
import SttSettingsPage from "@/features/STT/SttSettingsPage.vue";
import StatisticSettingsPage from "@/features/Statistic/StatisticSettingsPage.vue";
import TranslateSettingsPage from "@/features/Translate/TranslateSettingsPage.vue";
import TtsSettingsPage from "@/features/TTS/TtsSettingsPage.vue";
import AppearanceSettingsPage from "@/features/UI/components/AppearanceSettingsPage.vue";
import WebSearchSettingsPage from "@/features/WebSearch/WebSearchSettingsPage.vue";
import ConversationFavoriteSettingsPage from "./components/pages/ConversationFavoriteSettingsPage.vue";
import GeneralSettingsPage from "./components/pages/GeneralSettingsPage.vue";
import SubscriptionSettingsPage from "./components/pages/SubscriptionSettingsPage.vue";

interface SettingPageMeta {
	id: string;
	icon: Component;
	title: string;
}

interface SettingPageTab {
	id: string;
	title: string;
	component: Component;
}

export interface RegisteredSettingPage {
	meta: SettingPageMeta;
	component?: Component;
	tabs?: SettingPageTab[];
}

const pages = new Map<string, RegisteredSettingPage>();

function registerSettingPage(page: RegisteredSettingPage) {
	pages.set(page.meta.id, page);
}

export function getSettingPages() {
	return [...pages.values()];
}

export function getSettingPage(pageId: string) {
	return pages.get(pageId);
}

export function ensureDefaultSettingPages() {
	if (pages.size > 0) return;

	registerSettingPage({
		meta: { id: "tools.hotkey", icon: Keyboard, title: "快捷键" },
		component: HotkeySettingsPage,
	});
	registerSettingPage({
		meta: { id: "general", icon: Settings, title: "通用" },
		tabs: [
			{ id: "application", title: "应用", component: GeneralSettingsPage },
			{ id: "defaults", title: "默认项", component: DefaultConfigSettingsPage },
			{ id: "runtime", title: "运行时", component: RuntimeSettingsPage },
		],
	});
	registerSettingPage({
		meta: { id: "appearance.theme", icon: Palette, title: "主题" },
		component: AppearanceSettingsPage,
	});
	registerSettingPage({
		meta: { id: "provider.models", icon: Brain, title: "模型" },
		component: ModelProviderSettingsPage,
	});
	registerSettingPage({
		meta: { id: "provider.tts", icon: Volume2, title: "语音生成" },
		component: TtsSettingsPage,
	});
	registerSettingPage({
		meta: { id: "provider.stt", icon: Mic, title: "语音识别" },
		component: SttSettingsPage,
	});
	registerSettingPage({
		meta: {
			id: "provider.image-generation",
			icon: ImageIcon,
			title: "图片生成",
		},
		component: ImageGenerationSettingsPage,
	});
	registerSettingPage({
		meta: { id: "provider.web-search", icon: Globe, title: "网络搜索" },
		component: WebSearchSettingsPage,
	});
	registerSettingPage({
		meta: { id: "tools.translate", icon: Languages, title: "翻译" },
		component: TranslateSettingsPage,
	});
	registerSettingPage({
		meta: { id: "conversation.favorites", icon: Star, title: "消息收藏" },
		component: ConversationFavoriteSettingsPage,
	});
	registerSettingPage({
		meta: { id: "account.subscription", icon: CreditCard, title: "订阅方案" },
		component: SubscriptionSettingsPage,
	});
	registerSettingPage({
		meta: { id: "data.backup", icon: History, title: "版本管理" },
		component: BackupSettingsPage,
	});
	registerSettingPage({
		meta: { id: "data.statistic", icon: BarChart3, title: "数据统计" },
		component: StatisticSettingsPage,
	});
	registerSettingPage({
		meta: { id: "about.app", icon: Info, title: "关于" },
		component: AboutSettingsPage,
	});
}
