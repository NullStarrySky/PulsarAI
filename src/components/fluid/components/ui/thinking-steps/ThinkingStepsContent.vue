<script setup lang="ts">
import type { VNode } from "vue";
import { cn } from "../../../lib/utils";
import { useThinkingStepsOpen } from "./thinking-steps-context";
import CollapsePanel from "./CollapsePanel.vue";

// ─── ThinkingStepsContent ────────────────────────────────────────────────
// 根折叠区的内容面板；内部是纵向排列的步骤行。

const props = defineProps<{ class?: string }>();

const slots = defineSlots<{ default?: () => VNode[] }>();

defineOptions({ name: "ThinkingStepsContent" });

const { isOpen } = useThinkingStepsOpen();
</script>

<template>
  <CollapsePanel :open="isOpen">
    <div :class="cn('flex flex-col', props.class)">
      <slot />
    </div>
  </CollapsePanel>
</template>
