<script setup lang="ts">
import { ScrollArea } from "@/components/ui/scroll-area";

defineProps<{
	title: string;
	description?: string;
}>();
</script>

<template>
  <ScrollArea class="h-full">
    <section class="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6 px-7 pb-8 pt-2 mobile:gap-5 mobile:px-4 mobile:pb-5">
      <h2 class="sr-only">{{ title }}</h2>
      <slot />
    </section>
  </ScrollArea>
</template>
