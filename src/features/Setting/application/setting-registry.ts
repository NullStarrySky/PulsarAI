import type { Component } from "vue";
import { BarChart3, Brain, CreditCard, History, ImageIcon, Import, Info, Keyboard, Languages, Mic, Palette, Settings, Star, Volume2 } from "lucide-vue-next";
import GeneralSettingsPage from "../presentation/pages/GeneralSettingsPage.vue";
import SubscriptionSettingsPage from "../presentation/pages/SubscriptionSettingsPage.vue";
import ModelProviderSettingsPage from "@/features/ModelConnection/presentation/ModelProviderSettingsPage.vue";
import DefaultConfigSettingsPage from "@/features/defaultConfigs/presentation/DefaultConfigSettingsPage.vue";
import AboutSettingsPage from "@/features/About/presentation/AboutSettingsPage.vue";
import AppearanceSettingsPage from "@/features/UI/presentation/AppearanceSettingsPage.vue";
import HotkeySettingsPage from "@/features/Hotkey/presentation/HotkeySettingsPage.vue";
import BackupSettingsPage from "@/features/Backup/presentation/BackupSettingsPage.vue";
import StatisticSettingsPage from "@/features/Statistic/presentation/StatisticSettingsPage.vue";
import TranslateSettingsPage from "@/features/Translate/presentation/TranslateSettingsPage.vue";
import RuntimeSettingsPage from "@/features/Misc/presentation/RuntimeSettingsPage.vue";
import ConversationFavoriteSettingsPage from "@/features/Resources/Conversation/presentation/ConversationFavoriteSettingsPage.vue";
import TtsSettingsPage from "@/features/TTS/presentation/TtsSettingsPage.vue";
import SttSettingsPage from "@/features/STT/presentation/SttSettingsPage.vue";
import ImageGenerationSettingsPage from "@/features/ImageGeneration/presentation/ImageGenerationSettingsPage.vue";
import SillyTavernMigrationSettingsPage from "@/features/Migrations/SillyTavern/presentation/SillyTavernMigrationSettingsPage.vue";

export interface SettingPageMeta {
  id: string;
  icon: Component;
  title: string;
}

export interface SettingPageTab {
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

export function registerSettingPage(page: RegisteredSettingPage) {
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
    meta: { id: "provider.image-generation", icon: ImageIcon, title: "图片生成" },
    component: ImageGenerationSettingsPage,
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
    meta: { id: "data.migration", icon: Import, title: "数据迁移" },
    component: SillyTavernMigrationSettingsPage,
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
