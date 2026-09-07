<script setup lang="ts">
import type { VNode } from "vue";
import { cn } from "../../../lib/utils";

// ─── ThinkingStepSources ─────────────────────────────────────────────────
// 步骤产出的来源徽章行。

const props = defineProps<{ class?: string }>();

const slots = defineSlots<{ default?: () => VNode[] }>();

defineOptions({ name: "ThinkingStepSources" });
</script>

<template>
  <div :class="cn('mt-1 flex flex-wrap gap-1.5', props.class)">
    <slot />
  </div>
</template>
