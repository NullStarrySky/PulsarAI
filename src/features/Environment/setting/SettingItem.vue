<script setup lang="ts">
defineProps<{
	title: string;
	description?: string;
}>();
</script>

<template>
  <div class="grid min-h-14 gap-3 px-4 py-3.5 transition-colors sm:grid-cols-[minmax(12rem,1fr)_minmax(10rem,auto)] sm:items-center">
    <div class="min-w-0">
      <h4 class="text-sm font-medium leading-5 text-foreground/95">{{ title }}</h4>
      <p v-if="description" class="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">{{ description }}</p>
      <div v-if="$slots.bottom" class="mt-2.5">
        <slot name="bottom" />
      </div>
    </div>
    <div v-if="$slots.default" class="flex min-w-0 items-center justify-start sm:justify-end">
      <slot />
    </div>
  </div>
</template>
