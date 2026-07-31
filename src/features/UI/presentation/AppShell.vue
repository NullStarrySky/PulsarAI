<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Notivue, Notification } from "notivue";
import { storeToRefs } from "pinia";
import MainWorkspace from "./MainWorkspace.vue";
import SettingsDialog from "@/features/Setting/presentation/SettingsDialog.vue";
import CommandSearchDialog from "@/features/UI/search/presentation/CommandSearchDialog.vue";
import { useCommandStore } from "@/features/Hotkey/application/command-store";
import { useHotkeyStore } from "@/features/Hotkey/application/hotkey-store";
import { registerMiscCommands } from "@/features/Misc/actions";
import { useResponsiveStore } from "@/features/Misc/application/responsive-store";
import { useStatisticStore } from "@/features/Statistic/application/statistic-store";
import { readSubWindowParamsFromLocation } from "@/features/SubWindow/domain/sub-window-protocol";
import { registerCoreCommands } from "@/features/UI/actions";
import { useAppearanceStore } from "@/features/UI/theme/application/appearance-store";
import { useLayoutStore } from "../application/layout-store";
import ShellLeftSidebar from "./ShellLeftSidebar.vue";
import ShellRightSidebar from "./ShellRightSidebar.vue";
import ShellTopBar from "./ShellTopBar.vue";
import TextEditingContextMenu from "./TextEditingContextMenu.vue";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { useWindowLifecycleStore } from "../application/window-lifecycle-store";
import WindowCloseDialog from "./WindowCloseDialog.vue";

const appearance = useAppearanceStore();
const commandStore = useCommandStore();
const hotkeyStore = useHotkeyStore();
const layout = useLayoutStore();
const responsive = useResponsiveStore();
const conversation = useConversationStore();
const windowLifecycle = useWindowLifecycleStore();
const { isMobileLayout } = storeToRefs(responsive);
const { activeTabId, settingsOpen } = storeToRefs(layout);
let unlistenCloseRequested: UnlistenFn | undefined;

onMounted(async () => {
  appearance.initialize();
  responsive.refreshPlatform();
  applySubWindowParams();
  registerCoreCommands();
  registerMiscCommands();
  void useStatisticStore().recordAppLaunch();
  window.addEventListener("keydown", onGlobalKeydown, { capture: true });
  const appWindow = getCurrentWindow();
  if (appWindow.label === "main") {
    unlistenCloseRequested = await appWindow.onCloseRequested((event) => {
      event.preventDefault();
      void windowLifecycle.handleCloseRequest();
    });
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onGlobalKeydown, { capture: true });
  unlistenCloseRequested?.();
});

watch(isMobileLayout, (mobile) => {
  if (mobile) {
    layout.closeSidebars();
  }
}, { immediate: true });

watch([activeTabId, settingsOpen], () => {
  if (isMobileLayout.value) {
    layout.closeSidebars();
  }
});

function applySubWindowParams() {
  const params = readSubWindowParamsFromLocation();
  if (!params) {
    return;
  }

  layout.setShellMode(params.mode);
  const target = params.target;
  if (target.type === "resource") {
    layout.openResourceTab({
      resourceType: target.resourceType,
      resourceId: target.resourceId,
      packageId: target.packageId,
      title: target.title ?? target.resourceId,
      resourceParams: target.resourceParams,
    });
  } else if (target.type === "builtin") {
    layout.openResourceTab({
      resourceType: "builtin",
      resourceId: target.resourceId,
      title: target.title ?? target.resourceId,
      resourceParams: target.resourceParams,
    });
  }
}

function onGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "r") {
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      if (!window.confirm("清空全部角色包、角色包对话和本地插件，并恢复初始角色包？设置和密钥不会改动。")) {
        return;
      }
      void conversation.resetCharacterPackages().then(() => window.location.reload());
      return;
    }
    window.location.reload();
    return;
  }
  const target = event.target as HTMLElement | null;
  const editing = target?.closest("input, textarea, [contenteditable='true']");
  const commandId = hotkeyStore.commandIdForEvent(event);
  if (!commandId || (editing && commandId !== "ui.search.open")) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  void commandStore.executeCommand(commandId);
}
</script>

<template>
  <div
    :class="{ 'mobile-layout': isMobileLayout }"
    class="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-background text-foreground"
  >
    <ShellTopBar />

    <div class="relative flex min-h-0 min-w-0 flex-1 bg-muted/10">
      <button
        v-if="isMobileLayout && (layout.leftSidebarOpen || layout.rightSidebarOpen)"
        type="button"
        class="fixed inset-x-0 bottom-0 top-12 z-30 bg-foreground/20 backdrop-blur-[1px]"
        aria-label="关闭侧栏"
        @click="layout.closeSidebars"
      />
      <ShellLeftSidebar v-if="layout.shellMode !== 'simplified'" />
      <MainWorkspace />
      <ShellRightSidebar v-if="layout.shellMode !== 'simplified'" />
    </div>
    <SettingsDialog />
    <WindowCloseDialog />
    <CommandSearchDialog />
    <TextEditingContextMenu />
    <Notivue v-slot="item">
      <Notification :item="item" />
    </Notivue>
  </div>
</template>
