<script setup lang="ts">
import { computed } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import type { ItemRect } from "../../../hooks/use-fluid-hover";

export interface FluidHoverHighlightProps {
  /** The rect to sit on, in the container's coordinate space. null hides the highlight. */
  rect: ItemRect | null;
  /** session number from useFluidHover. */
  session: number;
  /** Where a fresh session fades in from. Defaults to rect. */
  from?: ItemRect | null;
  /** Custom class, e.g. shape.bg, merged onto pointer-events-none absolute bg-hover. */
  class?: any;
  /** Positional spring transition or false to snap. */
  transition?: any;
}

const props = withDefaults(defineProps<FluidHoverHighlightProps>(), {
  from: null,
  class: undefined,
  transition: undefined,
});

defineOptions({ name: "FluidHoverHighlight" });

const fade = { duration: 0.08 };
const snap = { duration: 0 };

const resolvedTransition = computed(() => {
  if (props.transition === false) {
    return { ...snap, opacity: fade };
  }
  const positional = props.transition ?? spring.fast;
  return { ...positional, opacity: fade };
});
</script>

<template>
  <AnimatePresence>
    <motion.div
      v-if="rect"
      :key="session"
      data-slot="fluid-hover-highlight"
      :class="cn('pointer-events-none absolute bg-hover', props.class)"
      :initial="{ opacity: 0, ...(from ?? rect) }"
      :animate="{ opacity: 1, ...rect }"
      :exit="{ opacity: 0, transition: spring.fast.exit }"
      :transition="resolvedTransition"
    />
  </AnimatePresence>
</template>
