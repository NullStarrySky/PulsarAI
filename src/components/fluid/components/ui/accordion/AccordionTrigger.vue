<script setup lang="ts">
import { computed, ref, type HTMLAttributes } from "vue";
import {
  AccordionHeader,
  AccordionTrigger as AccordionTriggerPrimitive,
} from "reka-ui";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { useIcon } from "../../../lib/icon-context";
import { spring } from "../../../lib/springs";
import { fontWeights } from "../../../lib/font-weight";
import { useShape } from "../../../lib/shape-context";
import { useSize } from "../../../lib/size-context";
import { useAccordionGroup, useAccordionItemContext } from "./accordion-context";

defineProps<{ class?: HTMLAttributes["class"] }>();

const ChevronRight = useIcon("chevron-right");
const groupCtx = useAccordionGroup();
const { index, isOpen, triggerEl, highlight } = useAccordionItemContext();
const shape = useShape();
const sizeClasses = useSize();
const isHovered = ref(false);

const isActive = computed(() =>
  groupCtx?.grouped ? groupCtx.activeIndex.value === index : isHovered.value
);

// 折叠动效对减弱动效用户保持可用（chevron 的旋转是反馈而非位移），
// 与 React 版一致：仅无限循环的 glyph morph 需要 reduceMotion 短路。
const triggerClass = computed(() =>
  cn(
    `relative z-10 flex items-center ${sizeClasses.value.gap} ${shape.value.item} ${sizeClasses.value.px} ${sizeClasses.value.variant === "compact" ? "py-1" : "py-2"} w-full cursor-pointer outline-none select-none`,
    !groupCtx?.grouped &&
      "focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)] focus-visible:ring-offset-0"
  )
);

// 组内模式把触发器包在 triggerEl 供邻近悬停注册；独立模式无需额外引用。
</script>

<template>
  <!-- 组内模式：包一层 div 供邻近悬停注册 -->
  <div v-if="groupCtx?.grouped" :ref="(el) => (triggerEl = el as HTMLDivElement)">
    <AccordionHeader as-child>
      <div>
        <AccordionTriggerPrimitive :class="cn(triggerClass, $props.class)">
          <!-- 双层文本标签 -->
          <span :class="cn('inline-grid flex-1 text-left', sizeClasses.text)">
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
                  isOpen || isActive ? 'text-foreground' : 'text-muted-foreground'
                )
              "
              :style="{
                fontVariationSettings: isOpen ? fontWeights.semibold : fontWeights.normal,
              }"
            >
              <slot />
            </span>
          </span>

          <!-- Chevron — 折叠时朝右，展开时旋转 90° 朝下 -->
          <motion.span
            class="inline-flex shrink-0 items-center justify-center"
            :animate="{ rotate: isOpen ? 90 : 0 }"
            :transition="spring.fast"
          >
            <ChevronRight
              :size="sizeClasses.icon"
              :stroke-width="isOpen || isActive ? 2 : 1.5"
              :class="
                cn(
                  'transition-[color,stroke-width] duration-80',
                  isOpen || isActive ? 'text-foreground' : 'text-muted-foreground'
                )
              "
            />
          </motion.span>
        </AccordionTriggerPrimitive>
      </div>
    </AccordionHeader>
  </div>

  <!-- 独立模式：本地悬停 + 动画背景 -->
  <div
    v-else
    class="relative"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- 打开染色，限定在本行：下方面板保持页面自己的表面，
        侧边栏行高亮而不给子树着色的方式。 -->
    <AnimatePresence>
      <motion.div
        v-if="isOpen && highlight === 'trigger' && isHovered"
        :class="`absolute inset-0 ${shape.bg} bg-accent/20 dark:bg-accent/12 pointer-events-none`"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0, transition: spring.moderate.exit }"
        :transition="{ duration: 0.12 }"
      />
    </AnimatePresence>
    <AnimatePresence>
      <motion.div
        v-if="isHovered"
        :class="`absolute inset-0 ${shape.bg} bg-hover pointer-events-none`"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0, transition: spring.fast.exit }"
        :transition="{ duration: 0.08 }"
      />
    </AnimatePresence>
    <AccordionHeader as-child>
      <div>
        <AccordionTriggerPrimitive :class="cn(triggerClass, $props.class)">
          <span :class="cn('inline-grid flex-1 text-left', sizeClasses.text)">
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
                  isOpen || isActive ? 'text-foreground' : 'text-muted-foreground'
                )
              "
              :style="{
                fontVariationSettings: isOpen ? fontWeights.semibold : fontWeights.normal,
              }"
            >
              <slot />
            </span>
          </span>
          <motion.span
            class="inline-flex shrink-0 items-center justify-center"
            :animate="{ rotate: isOpen ? 90 : 0 }"
            :transition="spring.fast"
          >
            <ChevronRight
              :size="sizeClasses.icon"
              :stroke-width="isOpen || isActive ? 2 : 1.5"
              :class="
                cn(
                  'transition-[color,stroke-width] duration-80',
                  isOpen || isActive ? 'text-foreground' : 'text-muted-foreground'
                )
              "
            />
          </motion.span>
        </AccordionTriggerPrimitive>
      </div>
    </AccordionHeader>
  </div>
</template>
