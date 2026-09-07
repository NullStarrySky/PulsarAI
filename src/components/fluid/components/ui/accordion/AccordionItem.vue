<script setup lang="ts">
import { computed, ref, watch, type HTMLAttributes } from "vue";
import { AccordionItem as AccordionItemPrimitive } from "reka-ui";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { useShape } from "../../../lib/shape-context";
import { useAccordionGroup, provideAccordionItem, useStandaloneOpen } from "./accordion-context";

const props = withDefaults(
  defineProps<{
    value: string;
    index?: number;
    disabled?: boolean;
    /** AccordionGroup 的 prop 在独立 item 上的等价物：打开的 item 染色什么。
     *  在组内被忽略——组为所有行做决定。 @default "item" */
    highlight?: "trigger" | "item";
    class?: HTMLAttributes["class"];
  }>(),
  { highlight: "item" }
);

const internalRef = ref<HTMLDivElement | null>(null);
const triggerEl = ref<HTMLDivElement | null>(null);
const groupCtx = useAccordionGroup();
const standaloneOpen = useStandaloneOpen();
const shape = useShape();

function setItemRef(el: any) {
  internalRef.value = (el?.$el as HTMLDivElement | null) ?? el ?? null;
}

const isOpen = computed<boolean>(() =>
  groupCtx?.grouped
    ? groupCtx.openValues.value.has(props.value)
    : standaloneOpen.value.has(props.value)
);

const claimedIndex = ref<number>(props.index ?? -1);
if (claimedIndex.value === -1 && groupCtx?.claimIndex) {
  claimedIndex.value = groupCtx.claimIndex();
}
const resolvedIndex = computed(() => props.index ?? claimedIndex.value);

// 注册触发器元素（不是完整 item）供邻近悬停使用
watch(
  [resolvedIndex, triggerEl] as const,
  ([index, el], _prev, onCleanup) => {
    if (groupCtx?.grouped && index !== undefined && index >= 0) {
      groupCtx.registerItem(index, el);
      onCleanup(() => groupCtx.registerItem(index, null));
    }
  },
  { immediate: true }
);

// 注册完整 item 元素供展开背景测量使用
watch(
  [resolvedIndex, isOpen, internalRef] as const,
  ([index, open, el], _prev, onCleanup) => {
    if (groupCtx?.grouped && index !== undefined && index >= 0) {
      groupCtx.registerFullItem(index, open ? el : null);
      onCleanup(() => groupCtx.registerFullItem(index, null));
    }
  },
  { immediate: true }
);

provideAccordionItem({
  index: resolvedIndex.value,
  value: props.value,
  isOpen,
  highlight: props.highlight,
  triggerEl,
});
</script>

<template>
  <AccordionItemPrimitive
    :value="value"
    :disabled="disabled"
    :data-proximity-index="resolvedIndex"
    :ref="setItemRef"
    :class="cn(!groupCtx?.grouped && 'relative', props.class)"
  >
    <!-- 独立模式的展开背景。默认 "trigger" 选择下，染色位于 AccordionTrigger
        内部，只覆盖行而不覆盖下方面板。 -->
    <AnimatePresence v-if="!groupCtx?.grouped && highlight === 'item'">
      <motion.div
        v-if="isOpen"
        :class="`absolute inset-0 ${shape.bg} bg-accent/20 dark:bg-accent/12 pointer-events-none`"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0, transition: spring.moderate.exit }"
        :transition="{ duration: 0.12 }"
      />
    </AnimatePresence>
    <slot />
  </AccordionItemPrimitive>
</template>
