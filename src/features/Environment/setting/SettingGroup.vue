<script setup lang="ts">
defineProps<{
	title?: string;
	description?: string;
}>();
</script>

<template>
  <section class="space-y-2">
    <header v-if="title || description || $slots.actions" class="px-1 flex min-h-6 items-center justify-between gap-4">
      <div class="min-w-0">
        <h3 v-if="title" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ title }}</h3>
        <p v-if="description" class="text-xs text-muted-foreground mt-0.5">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-1.5">
        <slot name="actions" />
      </div>
    </header>
    <div class="rounded-2xl border border-border/80 bg-card/80 shadow-xs divide-y divide-border/50 overflow-hidden backdrop-blur-xs transition-colors">
      <slot />
    </div>
  </section>
</template>
