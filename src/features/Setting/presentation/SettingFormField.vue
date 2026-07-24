<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
  required?: boolean;
}>();
</script>

<template>
  <div class="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(13rem,1fr)_minmax(14rem,28rem)]">
    <div class="min-w-0 space-y-1">
      <div class="block text-sm font-medium">
        <span v-if="required" class="text-destructive">*</span>
        {{ title }}
      </div>
      <div v-if="description" class="block max-w-[42rem] text-xs leading-5 text-muted-foreground">{{ description }}</div>
    </div>
    <div class="flex min-w-0 flex-col items-stretch justify-center gap-2 sm:items-end">
      <div class="flex w-full justify-end">
        <slot />
      </div>
      <div v-if="$slots.description" class="block w-full text-xs leading-5 text-muted-foreground sm:text-right">
        <slot name="description" />
      </div>
    </div>
    <div v-if="$slots.bottom" class="min-w-0 sm:col-span-2">
      <slot name="bottom" />
    </div>
  </div>
</template>
