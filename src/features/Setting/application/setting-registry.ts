import type { Component } from "vue";
import { BarChart3, BellRing, Brain, CreditCard, History, Info, Keyboard, Languages, Palette, Settings, SlidersHorizontal } from "lucide-vue-next";
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

export interface SettingPageMeta {
  id: string;
  icon: Component;
  title: string;
  group: string;
}

export interface SettingGroupMeta {
  id: string;
  title: string;
}

export interface RegisteredSettingPage {
  meta: SettingPageMeta;
  component: Component;
}

const groups = new Map<string, SettingGroupMeta>();
const pages = new Map<string, RegisteredSettingPage>();

export function registerSettingGroup(group: SettingGroupMeta) {
  groups.set(group.id, group);
}

export function registerSettingPage(page: RegisteredSettingPage) {
  pages.set(page.meta.id, page);
}

export function getSettingGroups() {
  return [...groups.values()];
}

export function getSettingPages() {
  return [...pages.values()];
}

export function getSettingPage(pageId: string) {
  return pages.get(pageId);
}

export function ensureDefaultSettingPages() {
  if (pages.size > 0) {
    return;
  }

  registerSettingGroup({ id: "general", title: "基础" });
  registerSettingGroup({ id: "account", title: "账户" });
  registerSettingGroup({ id: "appearance", title: "外观" });
  registerSettingGroup({ id: "provider", title: "模型" });
  registerSettingGroup({ id: "tools", title: "工具" });
  registerSettingGroup({ id: "data", title: "数据" });
  registerSettingGroup({ id: "about", title: "关于" });

  registerSettingPage({
    meta: {
      id: "general.behavior",
      icon: Settings,
      title: "通用设置",
      group: "general",
    },
    component: GeneralSettingsPage,
  });

  registerSettingPage({
    meta: {
      id: "general.defaults",
      icon: SlidersHorizontal,
      title: "默认项",
      group: "general",
    },
    component: DefaultConfigSettingsPage,
  });

  registerSettingPage({
    meta: {
      id: "general.runtime",
      icon: BellRing,
      title: "运行时",
      group: "general",
    },
    component: RuntimeSettingsPage,
  });

  registerSettingPage({
    meta: {
      id: "account.subscription",
      icon: CreditCard,
      title: "订阅方案",
      group: "account",
    },
    component: SubscriptionSettingsPage,
  });

  registerSettingPage({
    meta: {
      id: "appearance.theme",
      icon: Palette,
      title: "外观",
      group: "appearance",
    },
    component: AppearanceSettingsPage,
  });

  registerSettingPage({
    meta: {
      id: "tools.hotkey",
      icon: Keyboard,
      title: "快捷键",
      group: "tools",
    },
    component: HotkeySettingsPage,
  });

  registerSettingPage({
    meta: {
      id: "tools.translate",
      icon: Languages,
      title: "翻译",
      group: "tools",
    },
    component: TranslateSettingsPage,
  });

  registerSettingPage({
    meta: {
      id: "provider.models",
      icon: Brain,
      title: "模型提供商",
      group: "provider",
    },
    component: ModelProviderSettingsPage,
  });

  registerSettingPage({
    meta: {
      id: "data.backup",
      icon: History,
      title: "版本管理",
      group: "data",
    },
    component: BackupSettingsPage,
  });

  registerSettingPage({
    meta: {
      id: "data.statistic",
      icon: BarChart3,
      title: "数据统计",
      group: "data",
    },
    component: StatisticSettingsPage,
  });

  registerSettingPage({
    meta: {
      id: "about.app",
      icon: Info,
      title: "关于",
      group: "about",
    },
    component: AboutSettingsPage,
  });
}
