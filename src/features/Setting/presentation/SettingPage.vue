<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <section class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
    <header class="flex flex-col gap-1">
      <h2 class="text-2xl font-semibold">{{ title }}</h2>
      <p v-if="description" class="text-sm text-muted-foreground">{{ description }}</p>
    </header>
    <slot />
  </section>
</template>
