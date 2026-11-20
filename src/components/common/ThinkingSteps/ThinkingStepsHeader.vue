<script setup lang="ts">
import type { VNode } from "vue";
import { useThinkingStepsOpen } from "./thinking-steps-context";
import CollapseTriggerRow from "./CollapseTriggerRow.vue";

// ─── ThinkingStepsHeader ─────────────────────────────────────────────────
// 根折叠区的触发器行；label 默认「Thinking」。

const props = defineProps<{ class?: string }>();

const slots = defineSlots<{ default?: () => VNode[] }>();

defineOptions({ name: "ThinkingStepsHeader", inheritAttrs: false });

const { isOpen } = useThinkingStepsOpen();
</script>

<template>
  <CollapseTriggerRow :open="isOpen" :class="props.class">
    <slot>{{ "Thinking" }}</slot>
  </CollapseTriggerRow>
</template>
