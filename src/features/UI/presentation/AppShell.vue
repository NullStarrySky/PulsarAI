<script setup lang="ts">
import { onMounted } from "vue";
import ConversationStageOnePage from "@/features/Resources/Conversation/presentation/ConversationStageOnePage.vue";
import SettingsDialog from "@/features/Setting/presentation/SettingsDialog.vue";
import { useResponsiveStore } from "@/features/Misc/application/responsive-store";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import { useAppearanceStore } from "@/features/UI/theme/application/appearance-store";
import ShellTopBar from "./ShellTopBar.vue";
import CommandSearchDialog from "@/features/UI/search/presentation/CommandSearchDialog.vue";
import { registerCoreCommands } from "@/features/UI/actions";

const appearance = useAppearanceStore();
const responsive = useResponsiveStore();
const layout = useLayoutStore();

onMounted(() => {
  registerCoreCommands();
  appearance.initialize();
  responsive.refreshPlatform();
});
</script>

<template>
  <div class="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-background text-foreground">
    <ShellTopBar v-show="!layout.immersiveConversation" />
    <div class="min-h-0 flex-1">
      <ConversationStageOnePage />
    </div>
    <SettingsDialog />
    <CommandSearchDialog />
  </div>
</template>
