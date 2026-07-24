import type { Component } from "vue";

export type ShellSidebarSlot = "left" | "right";

const sidebarComponents = new Map<ShellSidebarSlot, Component>();

export function registerShellSidebar(slot: ShellSidebarSlot, component: Component) {
  sidebarComponents.set(slot, component);
}

export function getShellSidebarComponent(slot: ShellSidebarSlot) {
  return sidebarComponents.get(slot);
}
