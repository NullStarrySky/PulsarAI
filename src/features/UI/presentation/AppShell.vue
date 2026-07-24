<script setup lang="ts">
import { onMounted } from "vue";
import { Notivue, Notification } from "notivue";
import MainWorkspace from "./MainWorkspace.vue";
import SettingsDialog from "@/features/Setting/presentation/SettingsDialog.vue";
import CommandSearchDialog from "@/features/UI/search/presentation/CommandSearchDialog.vue";
import { useCommandStore } from "@/features/Hotkey/application/command-store";
import { useHotkeyStore } from "@/features/Hotkey/application/hotkey-store";
import { useStatisticStore } from "@/features/Statistic/application/statistic-store";
import { readSubWindowParamsFromLocation } from "@/features/SubWindow/domain/sub-window-protocol";
import { registerCoreCommands } from "@/features/UI/actions";
import { useAppearanceStore } from "@/features/UI/theme/application/appearance-store";
import { useLayoutStore } from "../application/layout-store";
import ShellLeftSidebar from "./ShellLeftSidebar.vue";
import ShellRightSidebar from "./ShellRightSidebar.vue";
import ShellTopBar from "./ShellTopBar.vue";

const appearance = useAppearanceStore();
const commandStore = useCommandStore();
const hotkeyStore = useHotkeyStore();
const layout = useLayoutStore();

onMounted(() => {
  appearance.initialize();
  applySubWindowParams();
  registerCoreCommands();
  void useStatisticStore().recordAppLaunch();
  window.addEventListener("keydown", onGlobalKeydown, { capture: true });
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
  <div class="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-background text-foreground">
    <ShellTopBar />

    <div class="flex min-h-0 min-w-0 flex-1 bg-muted/10">
      <ShellLeftSidebar v-if="layout.shellMode !== 'simplified'" />
      <MainWorkspace />
      <ShellRightSidebar v-if="layout.shellMode !== 'simplified'" />
    </div>
    <SettingsDialog />
    <CommandSearchDialog />
    <Notivue v-slot="item">
      <Notification :item="item" />
    </Notivue>
  </div>
</template>
