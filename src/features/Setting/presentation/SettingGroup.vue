<script setup lang="ts">
defineProps<{
  title?: string;
  description?: string;
}>();
</script>

<template>
  <section class="rounded-lg border bg-card">
    <header v-if="title || description || $slots.actions" class="flex items-center justify-between gap-4 border-b px-4 py-3">
      <div class="min-w-0">
        <h3 v-if="title" class="text-sm font-semibold leading-5 text-foreground/90">{{ title }}</h3>
        <p v-if="description" class="mt-1 text-xs leading-5 text-muted-foreground">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-1.5">
        <slot name="actions" />
      </div>
    </header>
    <div class="divide-y">
      <slot />
    </div>
  </section>
</template>
