import { defineStore } from "pinia";

export interface WorkspaceTab {
  id: string;
  title: string;
  closable?: boolean;
  packageId?: string;
  conversationId?: string;
}

const defaultTabs: WorkspaceTab[] = [];

export const useLayoutStore = defineStore("layout", {
  state: () => ({
    leftSidebarOpen: true,
    rightSidebarOpen: true,
    settingsOpen: false,
    activeTabId: "",
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

      if (existing) {
        Object.assign(existing, tab);
      } else {
        this.tabs.push({ closable: true, ...tab });
      }

      this.activeTabId = tab.id;
    },
    openConversationTab(input: { packageId: string; conversationId: string; title: string }) {
      this.openTab({
        id: `conversation:${input.conversationId}`,
        title: input.title,
        packageId: input.packageId,
        conversationId: input.conversationId,
      });
    },
    closeTab(tabId: string) {
      const index = this.tabs.findIndex((tab) => tab.id === tabId);

      if (index === -1) {
        return;
      }

      this.tabs.splice(index, 1);

      if (this.activeTabId === tabId) {
        this.activeTabId = this.tabs[Math.max(0, index - 1)]?.id ?? "";
      }
    },
    closeTabsByConversation(conversationId: string) {
      for (const tab of [...this.tabs]) {
        if (tab.conversationId === conversationId) {
          this.closeTab(tab.id);
        }
      }
    },
    closeTabsByPackage(packageId: string) {
      for (const tab of [...this.tabs]) {
        if (tab.packageId === packageId) {
          this.closeTab(tab.id);
        }
      }
    },
  },
});
