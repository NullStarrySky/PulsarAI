<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "../../../lib/utils";

const props = defineProps<{ class?: HTMLAttributes["class"] }>();
</script>

<template>
  <div role="separator" :class="cn('-mx-1 my-1 h-px shrink-0 bg-border/60', props.class)" />
</template>
