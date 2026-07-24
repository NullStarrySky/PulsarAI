<script setup lang="ts">
import { computed } from "vue";
import { Bot } from "lucide-vue-next";
import { resourceDisplayUrl } from "@/features/Resources/application/resource-file-service";

const props = defineProps<{
  name: string;
  icon?: string;
}>();

const displayUrl = computed(() => resourceDisplayUrl(props.icon));
</script>

<template>
  <span class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-card">
    <img v-if="displayUrl" :src="displayUrl" :alt="name" class="size-full object-cover" />
    <Bot v-else class="size-4 text-muted-foreground" />
  </span>
</template>
