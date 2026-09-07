<script setup lang="ts">
import { computed, ref, type VNode } from "vue";
import { CollapsibleTrigger } from "reka-ui";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { fontWeights } from "../../../lib/font-weight";
import { useShape } from "../../../lib/shape-context";
import { useSize } from "../../../lib/size-context";
import { useIcon } from "../../../lib/icon-context";

// ─── 共享折叠部件：触发器行 ─────────────────────────────────────────────
// 悬停背景、双层可变字重标签，以及从右（收起）到下（展开）旋转的
// chevron。样式对齐库的 accordion trigger。

const props = defineProps<{
  open: boolean;
  class?: string;
}>();

const slots = defineSlots<{ default?: () => VNode[] }>();

defineOptions({ name: "CollapseTriggerRow", inheritAttrs: false });

const ChevronRightIcon = useIcon("chevron-right");
const shape = useShape();
const sizeClasses = useSize();
const isHovered = ref(false);
const highlighted = computed(() => props.open || isHovered.value);
</script>

<template>
  <div
    class="relative w-fit"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <AnimatePresence>
      <motion.div
        v-if="isHovered"
        :class="cn('pointer-events-none absolute inset-0 bg-hover', shape.bg)"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0, transition: spring.fast.exit }"
        :transition="{ duration: 0.08 }"
      />
    </AnimatePresence>
    <CollapsibleTrigger as-child>
      <button
        type="button"
        :class="
          cn(
            'relative z-10 flex cursor-pointer select-none items-center gap-2.5 outline-none',
            shape.item,
            sizeClasses.px,
            sizeClasses.variant === 'compact' ? 'py-1.5' : 'py-2',
            'focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]',
            props.class
          )
        "
      >
        <!-- 双层文本标签（不可见的加粗层预留宽度） -->
        <span :class="cn('inline-grid text-left', sizeClasses.text)">
          <span
            class="col-start-1 row-start-1 invisible"
            :style="{ fontVariationSettings: fontWeights.semibold }"
            aria-hidden="true"
          >
            <slot />
          </span>
          <span
            :class="
              cn(
                'col-start-1 row-start-1 transition-[color,font-variation-settings] duration-80',
                highlighted ? 'text-foreground' : 'text-muted-foreground'
              )
            "
            :style="{
              fontVariationSettings: open ? fontWeights.semibold : fontWeights.normal,
            }"
          >
            <slot />
          </span>
        </span>

        <!-- chevron——收起朝右，展开旋转 90° 朝下 -->
        <motion.span
          class="inline-flex shrink-0 items-center justify-center"
          :animate="{ rotate: open ? 90 : 0 }"
          :transition="spring.fast"
        >
          <ChevronRightIcon
            :size="sizeClasses.icon"
            :stroke-width="highlighted ? 2 : 1.5"
            :class="
              cn(
                'transition-[color,stroke-width] duration-80',
                highlighted ? 'text-foreground' : 'text-muted-foreground'
              )
            "
          />
        </motion.span>
      </button>
    </CollapsibleTrigger>
  </div>
</template>
