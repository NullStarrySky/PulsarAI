import type { Component } from "vue";
import {
  CalendarClock,
  FolderTree,
  Pin,
  PinOff,
  Search,
  Settings,
} from "lucide-vue-next";
import PluginHeaderButton from "@/features/Plugin/PluginHeaderButton.vue";

export interface HeaderActionContext {
  assetOpen: boolean;
  pluginOpen: boolean;
  topBarPinned: boolean;
  openSettings: () => void;
  openSchedule: () => void;
  openPalette: () => void;
  toggleLocalAssets: () => void;
  toggleTopBarPinned: () => void;
}

export interface HeaderActionEntry {
  id: string;
  title: string;
  /** Simple icon button rendered by the header shell. */
  icon?: Component;
  active?: boolean;
  onClick?: () => void;
  /** Feature-owned entry rendered instead of the plain icon button. */
  component?: Component;
}

/**
 * Ordered right-side action registry for the stage header. Feature-owned
 * entries (currently the plugin panel toggle) supply their own component.
 */
export function createHeaderActions(context: HeaderActionContext): HeaderActionEntry[] {
  return [
    { id: "settings", title: "设置", icon: Settings, onClick: context.openSettings },
    { id: "schedule", title: "定时任务", icon: CalendarClock, onClick: context.openSchedule },
    { id: "palette", title: "搜索", icon: Search, onClick: context.openPalette },
    {
      id: "assets",
      title: "资产",
      icon: FolderTree,
      active: context.assetOpen,
      onClick: context.toggleLocalAssets,
    },
    { id: "plugin-panel", title: "插件", component: PluginHeaderButton },
    {
      id: "pin",
      title: context.topBarPinned ? "自动折叠顶栏" : "固定顶栏",
      icon: context.topBarPinned ? Pin : PinOff,
      active: !context.topBarPinned,
      onClick: context.toggleTopBarPinned,
    },
  ];
}
