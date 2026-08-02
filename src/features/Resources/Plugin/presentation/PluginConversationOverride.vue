<script setup lang="ts">
import { computed } from "vue";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import {
  resolvePluginConversationOverride,
} from "@/features/Resources/Plugin/application/plugin-vue-runtime";

const props = defineProps<{
  packageId: string;
  enabledGlobalPluginIds?: string[];
  mainPluginId?: string;
}>();

const pluginStore = usePluginStore();
const runtime = computed(() =>
  resolvePluginConversationOverride(
    pluginStore.enabledPluginsForPackage(
      props.packageId,
      props.enabledGlobalPluginIds,
      props.mainPluginId,
    ),
  ),
);
</script>

<template>
  <component :is="runtime.component" v-if="runtime.component">
    <slot />
  </component>
  <slot v-else />
</template>
