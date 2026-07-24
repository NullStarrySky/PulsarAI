<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
    <div class="min-w-0">
      <h4 class="font-medium">{{ title }}</h4>
      <p v-if="description" class="mt-1 text-sm text-muted-foreground">{{ description }}</p>
      <div v-if="$slots.bottom" class="mt-3">
        <slot name="bottom" />
      </div>
    </div>
    <div v-if="$slots.default" class="flex items-center justify-start sm:justify-end">
      <slot />
    </div>
  </div>
</template>
