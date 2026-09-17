<script setup lang="ts">
defineProps<{
	title: string;
	description?: string;
}>();
</script>

<template>
  <section class="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6 mobile:gap-5">
    <h2 class="sr-only">{{ title }}</h2>
    <slot />
  </section>
</template>
