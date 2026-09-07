<script setup lang="ts">
import { AnimatePresence, motion } from "motion-v";
import { mergeSpring, cornerDelay } from "./use-merge-split";
import type { SelBlock } from "./use-merge-split";

defineProps<{
  /** useMergeSplitBlocks 产出的背景块——每个 run 一块，
   *  merge/split 进行中则是两个相邻的半块。 */
  blocks: SelBlock[];
}>();

defineOptions({ name: "SelectionBackgrounds" });
</script>

<template>
  <AnimatePresence>
    <motion.div
      v-for="b in blocks"
      :key="b.key"
      aria-hidden="true"
      class="pointer-events-none absolute bg-active"
      :initial="
        b.enterFrom
          ? {
              opacity: b.opacity ?? 1,
              top: b.enterFrom.top,
              left: b.left,
              width: b.width,
              height: b.enterFrom.height,
              borderTopLeftRadius: b.enterFrom.radii[0],
              borderTopRightRadius: b.enterFrom.radii[1],
              borderBottomRightRadius: b.enterFrom.radii[2],
              borderBottomLeftRadius: b.enterFrom.radii[3],
            }
          : false
      "
      :animate="{
        top: b.top,
        left: b.left,
        width: b.width,
        height: b.height,
        borderTopLeftRadius: b.radii[0],
        borderTopRightRadius: b.radii[1],
        borderBottomRightRadius: b.radii[2],
        borderBottomLeftRadius: b.radii[3],
        opacity: b.opacity ?? 1,
      }"
      :exit="{ opacity: 0, transition: b.exitInstant ? { duration: 0 } : mergeSpring.exit }"
      :transition="
        b.instant
          ? { duration: 0 }
          : {
              ...mergeSpring,
              borderTopLeftRadius: b.delayCorners
                ? { ...mergeSpring, delay: b.cornerDelay ?? cornerDelay }
                : mergeSpring,
              borderTopRightRadius: b.delayCorners
                ? { ...mergeSpring, delay: b.cornerDelay ?? cornerDelay }
                : mergeSpring,
              borderBottomRightRadius: b.delayCorners
                ? { ...mergeSpring, delay: b.cornerDelay ?? cornerDelay }
                : mergeSpring,
              borderBottomLeftRadius: b.delayCorners
                ? { ...mergeSpring, delay: b.cornerDelay ?? cornerDelay }
                : mergeSpring,
              opacity: { duration: 0.08 },
            }
      "
    />
  </AnimatePresence>
</template>
