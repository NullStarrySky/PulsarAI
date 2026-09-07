<script setup lang="ts">
import { computed } from "vue";
import { TooltipPortal, TooltipContent as TooltipContentPrimitive, type TooltipContentProps } from "reka-ui";
import { motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { fontWeights } from "../../../lib/font-weight";
import { useShape } from "../../../lib/shape-context";
import { useTooltipPortalContainer } from "./tooltip-context";

const props = withDefaults(
  defineProps<TooltipContentProps & { class?: string }>(),
  { side: "top", sideOffset: 8 }
);

const shape = useShape();
const portalContainer = useTooltipPortalContainer();

function getSlideOffset(side?: string) {
  switch (side) {
    case "top":
      return { y: 4 };
    case "bottom":
      return { y: -4 };
    case "left":
      return { x: 4 };
    case "right":
      return { x: -4 };
    default:
      return { y: 4 };
  }
}

const slideOffset = computed(() => getSlideOffset(props.side));

const popupClass = computed(() =>
  cn(
    "bg-foreground px-2 py-1 text-[12px] text-background",
    "[text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both]:py-2",
    shape.value.bg,
    props.class
  )
);
</script>

<template>
  <TooltipPortal :to="portalContainer ?? undefined">
    <TooltipContentPrimitive
      :side="side"
      :side-offset="sideOffset"
      class="z-50"
      :style="{ pointerEvents: 'none' }"
    >
      <motion.div
        :class="popupClass"
        :style="{ fontVariationSettings: fontWeights.medium }"
        :initial="{ opacity: 0, ...slideOffset }"
        :animate="{ opacity: 1, x: 0, y: 0 }"
        :exit="{ opacity: 0, ...slideOffset }"
        :transition="spring.fast"
      >
        <slot />
      </motion.div>
    </TooltipContentPrimitive>
  </TooltipPortal>
</template>
