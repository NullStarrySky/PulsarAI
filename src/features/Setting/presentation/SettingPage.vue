<script setup lang="ts">
import { ScrollArea } from "@/components/ui/scroll-area";

defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <ScrollArea class="h-full">
    <section class="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6 p-6 mobile:gap-5 mobile:px-4 mobile:pb-5 mobile:pt-16">
      <header class="flex flex-col gap-1">
        <h2 class="text-2xl font-semibold mobile:text-xl">{{ title }}</h2>
        <p v-if="description" class="text-sm text-muted-foreground">{{ description }}</p>
      </header>
      <slot />
    </section>
  </ScrollArea>
</template>
