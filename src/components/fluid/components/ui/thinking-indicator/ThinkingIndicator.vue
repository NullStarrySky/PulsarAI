<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from "vue";
import { motion, AnimatePresence, useReducedMotion } from "motion-v";
import { cn } from "../../../lib/utils";
import { fontWeights } from "../../../lib/font-weight";
import { useSize, type SizeVariant } from "../../../lib/size-context";

const circleA =
  "M 12 8 C 14.21 8 16 9.79 16 12 C 16 14.21 14.21 16 12 16 C 9.79 16 8 14.21 8 12 C 8 9.79 9.79 8 12 8 Z";

const infinity =
  "M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z";

const circleB =
  "M 12 16 C 14.21 16 16 14.21 16 12 C 16 9.79 14.21 8 12 8 C 9.79 8 8 9.79 8 12 C 8 14.21 9.79 16 12 16 Z";

const words = ["Thinking", "Moonwalking", "Planning", "Refining"];

const props = withDefaults(
  defineProps<{
    /** 在标签前显示圆⇄无穷符号形变 glyph。设为 `false` 得到纯文本指示器
     *  （例如流式回复前的内联指示）。 */
    showIcon?: boolean;
    /** 尺寸阶梯的档位。优先于外围 SizeProvider。 */
    size?: SizeVariant;
    class?: string;
  }>(),
  { showIcon: true }
);

const compactStep = computed(() => useSize(() => props.size).value.variant === "compact");
const index = ref(0);
// 减弱动效会去掉无限的 glyph 形变与词语轮换——静态 glyph 与标签
// 承载同样的含义，而不需要运动。
const reduceMotion = computed(() => useReducedMotion().value ?? false);

let interval: ReturnType<typeof setInterval> | null = null;
function startCycling() {
  if (interval) return;
  interval = setInterval(() => {
    index.value = (index.value + 1) % words.length;
  }, 4000);
}
function stopCycling() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

watch(
  reduceMotion,
  (rm) => {
    if (rm) stopCycling();
    else startCycling();
  },
  { immediate: true }
);

onUnmounted(stopCycling);

const longestWord = words.reduce((a, b) => (a.length >= b.length ? a : b));
</script>

<template>
  <div role="status" :class="cn('flex items-center gap-2 px-3 py-2', props.class)">
    <!-- 静态播报——下方循环的词语展示是 aria-hidden 的，
        屏幕阅读器只听到一次 "Thinking…"，而不是每 4 秒重复一次。 -->
    <span class="sr-only">Thinking…</span>
    <motion.svg
      v-if="showIcon"
      aria-hidden="true"
      :width="compactStep ? 18 : 20"
      :height="compactStep ? 18 : 20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      :stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="shrink-0 text-muted-foreground"
    >
      <path v-if="reduceMotion" :d="infinity" />
      <motion.path
        v-else
        :d="circleA"
        :initial="{ d: circleA }"
        :animate="{ d: [circleA, infinity, circleB, infinity, circleA] }"
        :transition="{
          d: {
            duration: 6,
            ease: 'easeInOut',
            repeat: Infinity,
            times: [0, 0.25, 0.5, 0.75, 1.0],
          },
        }"
      />
    </motion.svg>
    <span
      aria-hidden="true"
      :class="cn('inline-grid overflow-hidden', compactStep ? 'text-[12px]' : 'text-[13px]')"
      :style="{ fontVariationSettings: fontWeights.medium }"
    >
      <span class="col-start-1 row-start-1 invisible shimmer-text">
        {{ longestWord }}
      </span>
      <span v-if="reduceMotion" class="col-start-1 row-start-1 shimmer-text">
        {{ words[0] }}
      </span>
      <AnimatePresence v-else mode="popLayout" :initial="false">
        <motion.span
          :key="words[index]"
          class="col-start-1 row-start-1 shimmer-text"
          :initial="{ y: '80%', opacity: 0 }"
          :animate="{
            y: 0,
            opacity: 1,
            transition: { duration: 0.24, ease: [0.4, 0, 0.2, 1] },
          }"
          :exit="{
            y: '-80%',
            opacity: 0,
            transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] },
          }"
        >
          {{ words[index] }}
        </motion.span>
      </AnimatePresence>
    </span>
  </div>
</template>
