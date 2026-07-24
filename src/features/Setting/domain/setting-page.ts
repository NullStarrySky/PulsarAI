import type { Component } from "vue";

export type SettingSlot = Component;

export interface SettingItem {
  title: string;
  description?: string;
  slot?: SettingSlot;
  bottomSlot?: SettingSlot;
}

export interface SettingGroup {
  title?: string;
  description?: string;
  items: Array<Component | SettingItem>;
}
