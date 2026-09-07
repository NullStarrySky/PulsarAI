<script setup lang="ts">
import { cn } from "../../../lib/utils";

const props = defineProps<{ class?: string }>();
</script>

<template>
  <div :class="cn('mb-4 flex flex-col gap-1.5', props.class)">
    <slot />
  </div>
</template>
