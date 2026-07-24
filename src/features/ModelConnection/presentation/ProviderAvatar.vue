<script setup lang="ts">
defineProps<{
  name: string;
  src?: string;
}>();
</script>

<template>
  <span class="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background">
    <img v-if="src" class="size-[18px] object-contain" :src="src" :alt="name" />
    <span v-else class="text-xs font-medium">{{ name.slice(0, 1).toUpperCase() }}</span>
  </span>
</template>
