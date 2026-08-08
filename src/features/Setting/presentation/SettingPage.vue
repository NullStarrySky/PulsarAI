<script setup lang="ts">
import { ScrollArea } from "@/components/ui/scroll-area";

defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <ScrollArea class="h-full">
    <section class="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-5 p-5 mobile:gap-4 mobile:px-4 mobile:pb-4 mobile:pt-14">
      <header class="flex flex-col gap-1">
        <h2 class="text-xl font-semibold leading-7 tracking-tight mobile:text-lg mobile:leading-6">{{ title }}</h2>
        <p v-if="description" class="max-w-3xl text-sm leading-5 text-muted-foreground">{{ description }}</p>
      </header>
      <slot />
    </section>
  </ScrollArea>
</template>
