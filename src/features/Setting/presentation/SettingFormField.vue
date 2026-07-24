<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
  required?: boolean;
}>();
</script>

<template>
  <div class="grid gap-3 px-4 py-4 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
    <div class="space-y-1">
      <div class="block text-sm font-medium">
        <span v-if="required" class="text-destructive">*</span>
        {{ title }}
      </div>
      <div v-if="description" class="block text-xs leading-5 text-muted-foreground">{{ description }}</div>
    </div>
    <div class="flex min-w-0 flex-col items-end gap-2">
      <div class="w-full max-w-md">
        <slot />
      </div>
      <div v-if="$slots.description" class="block text-xs leading-5 text-muted-foreground">
        <slot name="description" />
      </div>
    </div>
    <div v-if="$slots.bottom" class="min-w-0 sm:col-span-2">
      <slot name="bottom" />
    </div>
  </div>
</template>
