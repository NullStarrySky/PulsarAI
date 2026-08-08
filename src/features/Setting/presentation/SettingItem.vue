<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(13rem,1fr)_minmax(12rem,auto)]">
    <div class="min-w-0">
      <h4 class="text-sm font-medium leading-5 text-foreground/90">{{ title }}</h4>
      <p v-if="description" class="mt-1 max-w-[42rem] text-xs leading-5 text-muted-foreground">{{ description }}</p>
      <div v-if="$slots.bottom" class="mt-2">
        <slot name="bottom" />
      </div>
    </div>
    <div v-if="$slots.default" class="flex min-w-0 items-center justify-start sm:justify-end">
      <slot />
    </div>
  </div>
</template>
