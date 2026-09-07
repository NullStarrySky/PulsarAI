<script setup lang="ts">
import { computed, ref } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { fontWeights } from "../../../lib/font-weight";
import { useSize } from "../../../lib/size-context";
import type { IconComponent } from "../../../lib/icon-context";

const props = defineProps<{
  icon?: IconComponent;
  label: string;
  active?: boolean;
  checked?: boolean;
}>();

const hasMounted = ref(false);
queueMicrotask(() => {
  hasMounted.value = true;
});

const sizeClasses = useSize();
const skipAnimation = computed(() => !hasMounted.value);
</script>

<template>
  <span v-if="icon" class="inline-grid">
    <span class="col-start-1 row-start-1 invisible">
      <component :is="icon" :size="sizeClasses.icon" :stroke-width="2" />
    </span>
    <component
      :is="icon"
      :size="sizeClasses.icon"
      :stroke-width="active || checked ? 2 : 1.5"
      :class="
        cn(
          'col-start-1 row-start-1 transition-[color,stroke-width] duration-80',
          active || checked ? 'text-foreground' : 'text-muted-foreground'
        )
      "
    />
  </span>
  <!-- 两个堆叠 span 都带 text-box trim，不可见的加粗测量行与可见标签
      保持相同的盒子。 -->
  <span :class="cn('inline-grid flex-1', sizeClasses.text)">
    <span
      class="col-start-1 row-start-1 invisible [text-box:trim-both_cap_alphabetic]"
      :style="{ fontVariationSettings: fontWeights.semibold }"
      aria-hidden="true"
    >
      {{ label }}
    </span>
    <span
      :class="
        cn(
          'col-start-1 row-start-1 transition-[color,font-variation-settings] duration-80 [text-box:trim-both_cap_alphabetic]',
          active || checked ? 'text-foreground' : 'text-muted-foreground'
        )
      "
      :style="{
        fontVariationSettings: checked ? fontWeights.semibold : fontWeights.normal,
      }"
    >
      {{ label }}
    </span>
  </span>
  <AnimatePresence>
    <motion.svg
      v-if="checked"
      key="check"
      :width="sizeClasses.icon"
      :height="sizeClasses.icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      :stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="shrink-0 text-foreground"
      :initial="{ opacity: 1 }"
      :animate="{ opacity: 1 }"
      :exit="{ opacity: 1 }"
    >
      <motion.path
        d="M4 12L9 17L20 6"
        :initial="{ pathLength: skipAnimation ? 1 : 0 }"
        :animate="{
          pathLength: 1,
          transition: { duration: 0.08, ease: 'easeOut' },
        }"
        :exit="{
          pathLength: 0,
          transition: { duration: 0.04, ease: 'easeIn' },
        }"
      />
    </motion.svg>
  </AnimatePresence>
</template>
