import { defineStore } from "pinia";

export const shellSidebarMinWidth = 224;
export const shellSidebarMaxWidth = 480;
export const shellSidebarDefaultWidth = 288;

const sidebarStorageKey = "pulsarai:shell-sidebars:v1";

function clampSidebarWidth(width: number) {
  return Math.min(
    shellSidebarMaxWidth,
    Math.max(shellSidebarMinWidth, Math.round(width)),
  );
}

function readSidebarWidths() {
  const fallback = {
    leftSidebarWidth: shellSidebarDefaultWidth,
    rightSidebarWidth: shellSidebarDefaultWidth,
  };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const parsed = JSON.parse(localStorage.getItem(sidebarStorageKey) ?? "{}") as {
      leftSidebarWidth?: unknown;
      rightSidebarWidth?: unknown;
    };
    return {
      leftSidebarWidth: typeof parsed.leftSidebarWidth === "number"
        ? clampSidebarWidth(parsed.leftSidebarWidth)
        : fallback.leftSidebarWidth,
      rightSidebarWidth: typeof parsed.rightSidebarWidth === "number"
        ? clampSidebarWidth(parsed.rightSidebarWidth)
        : fallback.rightSidebarWidth,
    };
  } catch {
    return fallback;
  }
}

function persistSidebarWidths(leftSidebarWidth: number, rightSidebarWidth: number) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(sidebarStorageKey, JSON.stringify({
    leftSidebarWidth,
    rightSidebarWidth,
  }));
}

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
    ...readSidebarWidths(),
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
    setSidebarWidth(side: "left" | "right", width: number) {
      const normalized = clampSidebarWidth(width);
      if (side === "left") {
        this.leftSidebarWidth = normalized;
      } else {
        this.rightSidebarWidth = normalized;
      }
      persistSidebarWidths(this.leftSidebarWidth, this.rightSidebarWidth);
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
        const resourceParams =
          tab.resourceParams === undefined
            ? existing.resourceParams
            : tab.resourceParams;
        Object.assign(existing, tab);
        existing.resourceParams = resourceParams;
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
    updateResourceTabParams(
      resourceType: string,
      resourceId: string,
      patch: Record<string, unknown>,
    ) {
      for (const tab of this.tabs) {
        if (tab.resourceType === resourceType && tab.resourceId === resourceId) {
          tab.resourceParams = {
            ...(tab.resourceParams ?? {}),
            ...patch,
          };
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
