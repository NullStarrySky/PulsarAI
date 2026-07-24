<script setup lang="ts">
defineProps<{
  title?: string;
  description?: string;
}>();
</script>

<template>
  <section class="rounded-lg border bg-card">
    <header v-if="title || description" class="border-b px-4 py-3">
      <h3 v-if="title" class="font-medium">{{ title }}</h3>
      <p v-if="description" class="mt-1 text-sm text-muted-foreground">{{ description }}</p>
    </header>
    <div class="divide-y">
      <slot />
    </div>
  </section>
</template>
