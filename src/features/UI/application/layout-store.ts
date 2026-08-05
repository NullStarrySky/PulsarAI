import { defineStore } from "pinia";

export const shellSidebarMinWidth = 224;
export const shellSidebarMaxWidth = 480;
export const shellSidebarDefaultWidth = 288;

const sidebarStorageKey = "pulsarai:shell-sidebars:v1";
const keepTabsStorageKey = "pulsarai:keep-tabs-on-exit:v1";
const tabSessionStorageKey = "pulsarai:workspace-tabs:v1";

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

function readKeepTabsOnExit() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(keepTabsStorageKey) === "true";
}

function readTabSession() {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(tabSessionStorageKey) ?? "null") as {
      activeTabId?: unknown;
      tabs?: unknown;
    } | null;
    if (!parsed || !Array.isArray(parsed.tabs)) return null;
    const tabs = parsed.tabs.filter(isWorkspaceTab).map((tab) => ({
      ...tab,
      status: undefined,
    }));
    const activeTabId = typeof parsed.activeTabId === "string"
      && tabs.some((tab) => tab.id === parsed.activeTabId)
      ? parsed.activeTabId
      : tabs[0]?.id ?? "";
    return { activeTabId, tabs };
  } catch {
    return null;
  }
}

function isWorkspaceTab(value: unknown): value is WorkspaceTab {
  if (!value || typeof value !== "object") return false;
  const tab = value as Partial<WorkspaceTab>;
  return typeof tab.id === "string"
    && typeof tab.title === "string"
    && typeof tab.resourceType === "string"
    && typeof tab.resourceId === "string";
}

function persistTabSession(
  tabs: WorkspaceTab[],
  activeTabId: string,
  enabled: boolean,
) {
  if (typeof localStorage === "undefined") return;
  if (!enabled) {
    localStorage.removeItem(tabSessionStorageKey);
    return;
  }
  try {
    localStorage.setItem(tabSessionStorageKey, JSON.stringify({
      activeTabId,
      tabs: tabs.map((tab) => ({ ...tab, status: undefined })),
    }));
  } catch {
    // Ignore non-serializable resource parameters and keep the live tab state.
  }
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
    keepTabsOnExit: readKeepTabsOnExit(),
    tabSessionPersistenceActive: false,
    activeTabId: "",
    tabs: [...defaultTabs] as WorkspaceTab[],
  }),
  getters: {
    activeTab: (state) => state.tabs.find((tab) => tab.id === state.activeTabId),
  },
  actions: {
    initializeTabSession(isMainWindow: boolean) {
      this.tabSessionPersistenceActive = isMainWindow;
      if (!isMainWindow) return;
      if (!this.keepTabsOnExit) {
        persistTabSession([], "", false);
        return;
      }
      const session = readTabSession();
      if (session) {
        this.tabs = session.tabs;
        this.activeTabId = session.activeTabId;
      }
    },
    setKeepTabsOnExit(enabled: boolean) {
      this.keepTabsOnExit = enabled;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(keepTabsStorageKey, String(enabled));
      }
      this.persistTabSession();
    },
    persistTabSession() {
      if (!this.tabSessionPersistenceActive) return;
      persistTabSession(this.tabs, this.activeTabId, this.keepTabsOnExit);
    },
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
        this.persistTabSession();
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
      this.persistTabSession();
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
        this.persistTabSession();
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
      this.persistTabSession();
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
      this.persistTabSession();
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
      this.persistTabSession();
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
      this.persistTabSession();
    },
  },
});
