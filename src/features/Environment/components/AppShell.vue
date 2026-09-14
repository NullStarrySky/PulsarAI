<script setup lang="ts">
import { Notification, Notivue } from "notivue";
import { onMounted } from "vue";
import { useResponsiveStore } from "@/features/Environment/responsive-store";
import SettingsDialog from "@/features/Environment/setting/SettingsDialog.vue";
import {
	useEnvironmentHotkeys,
	useEnvironmentStore,
} from "@/features/Environment/store";
import AppContainer from "./AppContainer.vue";

const environment = useEnvironmentStore();
const responsive = useResponsiveStore();
useEnvironmentHotkeys();

onMounted(() => {
	void environment.initialize();
	responsive.refreshPlatform();
});
</script>

<template>
  <div
    class="flex h-[100dvh] min-w-0 flex-col overflow-hidden text-foreground"
    :class="environment.appearance.zenFrameEnabled ? 'bg-zen-frame-bg' : 'bg-background'"
    :style="environment.appearance.zenFrameEnabled ? { padding: `${environment.appearance.zenFrameWidth}px` } : undefined"
  >
    <div
      class="min-h-0 flex-1"
      :class="environment.appearance.zenFrameEnabled && 'overflow-hidden rounded-xl border border-zen-frame-border/80 bg-background shadow-sm mobile:rounded-lg'"
    >
      <AppContainer />
    </div>
    <SettingsDialog />
    <Notivue v-slot="item">
      <Notification :item="item" />
    </Notivue>
  </div>
</template>
