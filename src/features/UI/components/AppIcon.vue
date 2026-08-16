<script setup lang="ts">
import logoUrl from "../../../assets/logo.svg";

withDefaults(
  defineProps<{
    alt?: string;
  }>(),
  {
    alt: "PulsarAI",
  },
);
</script>

<template>
  <img
    :src="logoUrl"
    :alt="alt"
    class="shrink-0 rounded-[22%] ring-1 ring-foreground/10 shadow-sm dark:ring-white/15 dark:shadow-black/40"
  />
</template>
