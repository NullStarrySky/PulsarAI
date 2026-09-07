<script setup lang="ts">
import { computed, ref, watch, type VNode } from "vue";
import { CollapsibleRoot } from "reka-ui";
import { cn } from "../../../lib/utils";
import { provideSize, type SizeVariant } from "../../../lib/size-context";
import { provideThinkingStepsOpen } from "./thinking-steps-context";
import { usePropPassed } from "../../../lib/prop-passed";

// ─── ThinkingSteps（根）────────────────────────────────────────────────
// 「思考步骤」折叠区的根。始终以受控方式驱动 CollapsibleRoot，让
// header/panel 能从 context 读到 open（chevron 旋转、进出动画）。

const props = withDefaults(
  defineProps<{
    /** 阶梯档位。覆盖外围 SizeProvider 并传播到内部每一行。 */
    size?: SizeVariant;
    defaultOpen?: boolean;
    open?: boolean;
    class?: string;
  }>(),
  { defaultOpen: true }
);

const emit = defineEmits<{
  (e: "update:open", open: boolean): void;
}>();

const slots = defineSlots<{ default?: () => VNode[] }>();

defineOptions({ name: "ThinkingSteps" });

const openPassed = usePropPassed("open");
const internalOpen = ref(props.defaultOpen);
const isOpen = computed(() => (openPassed ? !!props.open : internalOpen.value));

watch(
  isOpen,
  (open) => {
    emit("update:open", open);
  },
  { immediate: false }
);

function handleOpenChange(next: boolean) {
  if (!openPassed) internalOpen.value = next;
  emit("update:open", next);
}

provideThinkingStepsOpen({ isOpen });

provideSize({ size: () => props.size });

const rootClass = computed(() => cn("w-80 max-w-full", props.class));
</script>

<template>
  <CollapsibleRoot :open="isOpen" @update:open="handleOpenChange" :class="rootClass">
    <slot />
  </CollapsibleRoot>
</template>
