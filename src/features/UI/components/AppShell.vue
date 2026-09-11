<script setup lang="ts">
import { Notification, Notivue } from "notivue";
import { onBeforeUnmount, onMounted } from "vue";
import ConversationSurface from "@/features/Conversation/stage/ConversationSurface.vue";
import { useCommandStore } from "@/features/Hotkey/command-store";
import { useHotkeyStore } from "@/features/Hotkey/hotkey-store";
import { useResponsiveStore } from "@/features/Misc/responsive-store";
import SettingsDialog from "@/features/Setting/components/SettingsDialog.vue";
import { registerCoreCommands } from "@/features/UI/actions";
import CommandSearchDialog from "@/features/UI/search/CommandSearchDialog.vue";
import { useAppearanceStore } from "@/features/UI/theme/appearance-store";

const appearance = useAppearanceStore();
const responsive = useResponsiveStore();
const commands = useCommandStore();
const hotkeys = useHotkeyStore();

function routeHotkey(event: KeyboardEvent) {
	if (event.defaultPrevented || event.isComposing) return;
	const commandId = hotkeys.commandIdForEvent(event);
	if (!commandId) return;
	event.preventDefault();
	void commands.executeCommand(commandId);
}

onMounted(() => {
	registerCoreCommands();
	window.addEventListener("keydown", routeHotkey, { capture: true });
	appearance.initialize();
	responsive.refreshPlatform();
});

onBeforeUnmount(() => {
	window.removeEventListener("keydown", routeHotkey, { capture: true });
});
</script>

<template>
  <div
    class="flex h-[100dvh] min-w-0 flex-col overflow-hidden text-foreground"
    :class="appearance.zenFrameEnabled ? 'bg-zen-frame-bg' : 'bg-background'"
    :style="appearance.zenFrameEnabled ? { padding: `${appearance.zenFrameWidth}px` } : undefined"
  >
    <div
      class="min-h-0 flex-1"
      :class="appearance.zenFrameEnabled && 'overflow-hidden rounded-xl border border-zen-frame-border/80 bg-background shadow-sm mobile:rounded-lg'"
    >
      <ConversationSurface />
    </div>
    <SettingsDialog />
    <CommandSearchDialog />
    <Notivue v-slot="item">
      <Notification :item="item" />
    </Notivue>
  </div>
</template>
