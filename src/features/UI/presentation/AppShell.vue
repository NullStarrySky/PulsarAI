<script setup lang="ts">
import { onMounted } from "vue";
import { Notivue, Notification } from "notivue";
import MainWorkspace from "./MainWorkspace.vue";
import SettingsDialog from "@/features/Setting/presentation/SettingsDialog.vue";
import CommandSearchDialog from "@/features/UI/search/presentation/CommandSearchDialog.vue";
import { useCommandStore } from "@/features/Hotkey/application/command-store";
import { useHotkeyStore } from "@/features/Hotkey/application/hotkey-store";
import { useStatisticStore } from "@/features/Statistic/application/statistic-store";
import { registerCoreCommands } from "@/features/UI/actions";
import { useAppearanceStore } from "@/features/UI/theme/application/appearance-store";
import ShellLeftSidebar from "./ShellLeftSidebar.vue";
import ShellRightSidebar from "./ShellRightSidebar.vue";
import ShellTopBar from "./ShellTopBar.vue";

const appearance = useAppearanceStore();
const commandStore = useCommandStore();
const hotkeyStore = useHotkeyStore();

onMounted(() => {
  appearance.initialize();
  registerCoreCommands();
  void useStatisticStore().recordAppLaunch();
  window.addEventListener("keydown", onGlobalKeydown, { capture: true });
});

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
      <ShellLeftSidebar />
      <MainWorkspace />
      <ShellRightSidebar />
    </div>
    <SettingsDialog />
    <CommandSearchDialog />
    <Notivue v-slot="item">
      <Notification :item="item" />
    </Notivue>
  </div>
</template>
