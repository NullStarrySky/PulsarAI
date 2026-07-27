import { defineStore } from "pinia";

export interface WorkspaceTab {
  id: string;
  title: string;
  resourceType: string;
  resourceId: string;
  closable?: boolean;
  packageId?: string;
  resourceParams?: Record<string, unknown>;
  status?: WorkspaceTabStatus;
}

export interface WorkspaceTabStatus {
  kind: "loading" | "success" | "warning" | "error";
  label?: string;
}

const defaultTabs: WorkspaceTab[] = [];

export const useLayoutStore = defineStore("layout", {
  state: () => ({
    leftSidebarOpen: true,
    rightSidebarOpen: false,
    settingsOpen: false,
    shellMode: "normal" as "normal" | "simplified",
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
    closeSidebars() {
      this.leftSidebarOpen = false;
      this.rightSidebarOpen = false;
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
    setShellMode(mode: "normal" | "simplified") {
      this.shellMode = mode;
      if (mode === "simplified") {
        this.leftSidebarOpen = false;
        this.rightSidebarOpen = false;
      }
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
    openResourceTab(input: { resourceType: string; resourceId: string; title: string; packageId?: string; resourceParams?: Record<string, unknown> }) {
      this.openTab({
        id: `${input.resourceType}:${input.resourceId}`,
        title: input.title,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        packageId: input.packageId,
        resourceParams: input.resourceParams,
      });
    },
    setTabStatus(tabId: string, status?: WorkspaceTabStatus) {
      const tab = this.tabs.find((item) => item.id === tabId);
      if (tab) {
        tab.status = status;
      }
    },
    setResourceTabStatus(
      resourceType: string,
      resourceId: string,
      status?: WorkspaceTabStatus,
    ) {
      for (const tab of this.tabs) {
        if (tab.resourceType === resourceType && tab.resourceId === resourceId) {
          tab.status = status;
        }
      }
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
    closeTabsByResource(resourceType: string, resourceId: string) {
      for (const tab of [...this.tabs]) {
        if (tab.resourceType === resourceType && tab.resourceId === resourceId) {
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
    closeActiveTab() {
      if (this.activeTabId) {
        this.closeTab(this.activeTabId);
      }
    },
    activateAdjacentTab(direction: -1 | 1) {
      if (this.tabs.length === 0) {
        return;
      }

      const currentIndex = Math.max(0, this.tabs.findIndex((tab) => tab.id === this.activeTabId));
      const nextIndex = (currentIndex + direction + this.tabs.length) % this.tabs.length;
      this.activeTabId = this.tabs[nextIndex]?.id ?? "";
    },
  },
});
