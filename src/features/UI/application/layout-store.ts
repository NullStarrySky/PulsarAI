import { defineStore } from "pinia";

export interface WorkspaceTab {
  id: string;
  title: string;
  closable?: boolean;
}

const defaultTabs: WorkspaceTab[] = [
  { id: "conversation", title: "Conversation", closable: false },
  { id: "providers", title: "Providers" },
  { id: "resources", title: "Resources" },
];

export const useLayoutStore = defineStore("layout", {
  state: () => ({
    leftSidebarOpen: true,
    rightSidebarOpen: true,
    settingsOpen: false,
    activeTabId: "conversation",
    tabs: [...defaultTabs] as WorkspaceTab[],
  }),
  getters: {
    activeTab: (state) => state.tabs.find((tab) => tab.id === state.activeTabId),
  },
  actions: {
    toggleLeftSidebar() {
      this.leftSidebarOpen = !this.leftSidebarOpen;
    },
    toggleRightSidebar() {
      this.rightSidebarOpen = !this.rightSidebarOpen;
    },
    openSettings() {
      this.settingsOpen = true;
    },
    closeSettings() {
      this.settingsOpen = false;
    },
    setSettingsOpen(open: boolean) {
      this.settingsOpen = open;
    },
    activateTab(tabId: string) {
      if (this.tabs.some((tab) => tab.id === tabId)) {
        this.activeTabId = tabId;
      }
    },
    openTab(tab: WorkspaceTab) {
      const existing = this.tabs.find((item) => item.id === tab.id);

      if (!existing) {
        this.tabs.push({ closable: true, ...tab });
      }

      this.activeTabId = tab.id;
    },
    closeTab(tabId: string) {
      const index = this.tabs.findIndex((tab) => tab.id === tabId);

      if (index === -1 || this.tabs[index]?.closable === false) {
        return;
      }

      this.tabs.splice(index, 1);

      if (this.activeTabId === tabId) {
        this.activeTabId = this.tabs[Math.max(0, index - 1)]?.id ?? "";
      }
    },
  },
});
