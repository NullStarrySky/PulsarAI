<script setup lang="ts">
import { Notification, Notivue } from "notivue";
import { onMounted } from "vue";
import ConversationStageOnePage from "@/features/Resources/Conversation/presentation/ConversationStageOnePage.vue";
import SettingsDialog from "@/features/Setting/presentation/SettingsDialog.vue";
import { useResponsiveStore } from "@/features/Misc/application/responsive-store";
import { useAppearanceStore } from "@/features/UI/theme/application/appearance-store";
import CommandSearchDialog from "@/features/UI/search/presentation/CommandSearchDialog.vue";
import { registerCoreCommands } from "@/features/UI/actions";

const appearance = useAppearanceStore();
const responsive = useResponsiveStore();

onMounted(() => {
  registerCoreCommands();
  appearance.initialize();
  responsive.refreshPlatform();
});
</script>

<template>
  <div class="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-zen-frame-bg text-foreground">
    <div class="min-h-0 flex-1">
      <ConversationStageOnePage />
    </div>
    <SettingsDialog />
    <CommandSearchDialog />
    <Notivue v-slot="item">
      <Notification :item="item" />
    </Notivue>
  </div>
</template>
