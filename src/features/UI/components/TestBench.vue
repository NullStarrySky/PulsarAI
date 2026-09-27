<script setup lang="ts">
import SettingsSidebar from "@/features/Environment/setting/SettingsSidebar.vue";
import { useEnvironmentStore } from "@/features/Environment/store";

defineProps<{ sidebarWidth: number }>();
const environment = useEnvironmentStore();
</script>

<template>
  <div class="flex size-full" :class="environment.glassEnabled ? 'bg-transparent' : 'bg-background'">
    <div class="h-full max-w-full shrink-0 overflow-hidden" :class="environment.glassEnabled ? 'bg-sidebar/35' : 'bg-sidebar'" :style="{ width: `${sidebarWidth}px` }">
      <SettingsSidebar class="h-full" />
    </div>
    <div class="min-w-0 flex-1" />
  </div>
</template>
