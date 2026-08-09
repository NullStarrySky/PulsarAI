<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
const props = defineProps<{ class?: HTMLAttributes["class"] }>();
</script>

<template>
  <legend :class="cn('text-base font-medium leading-7 text-foreground', props.class)"><slot /></legend>
</template>
