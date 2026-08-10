<script setup lang="ts">
import { computed } from "vue";
import { providerIconUrl } from "../application/provider-icons";

const props = defineProps<{
  name: string;
  src?: string;
  providerId?: string;
}>();

const iconSrc = computed(() => {
  return providerIconUrl(props.providerId || props.name, props.src);
});
</script>

<template>
  <span class="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background">
    <img v-if="iconSrc" class="size-[18px] object-contain" :src="iconSrc" :alt="name" />
    <span v-else class="text-xs font-medium">{{ name.slice(0, 1).toUpperCase() }}</span>
  </span>
</template>
