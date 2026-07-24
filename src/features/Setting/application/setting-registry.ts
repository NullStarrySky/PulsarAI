import type { Component } from "vue";
import { Brain, Settings, SlidersHorizontal } from "lucide-vue-next";
import GeneralSettingsPage from "../presentation/pages/GeneralSettingsPage.vue";
import ModelProviderSettingsPage from "@/features/ModelConnection/presentation/ModelProviderSettingsPage.vue";
import DefaultConfigSettingsPage from "@/features/defaultConfigs/presentation/DefaultConfigSettingsPage.vue";

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
  registerSettingGroup({ id: "provider", title: "模型" });

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
      id: "provider.models",
      icon: Brain,
      title: "模型提供商",
      group: "provider",
    },
    component: ModelProviderSettingsPage,
  });
}
