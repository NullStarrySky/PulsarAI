<script setup lang="ts">
defineProps<{
  title?: string;
}>();
</script>

<template>
  <section>
    <header v-if="title || $slots.actions" class="mb-2 flex min-h-8 items-center justify-between gap-4">
      <div class="min-w-0">
        <h3 v-if="title" class="text-sm font-semibold leading-5 text-foreground/90">{{ title }}</h3>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-1.5">
        <slot name="actions" />
      </div>
    </header>
    <div class="divide-y divide-border/70">
      <slot />
    </div>
  </section>
</template>
