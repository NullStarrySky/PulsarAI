<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch, type VNode } from "vue";
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipPortal,
  TooltipContent,
} from "reka-ui";
import { motion, useMotionValue } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { fontWeights } from "../../../lib/font-weight";
import { useShape } from "../../../lib/shape-context";
import { usePropPassed } from "../../../lib/prop-passed";
import { useTooltipPortalContainer } from "./tooltip-context";

const DEFAULT_DELAY = 200;

export type TooltipSide = "top" | "right" | "bottom" | "left";

const props = withDefaults(
  defineProps<{
    /** tooltip 文本（或用 #content slot 渲染富内容）。 */
    content?: string;
    side?: TooltipSide;
    sideOffset?: number;
    /** 此 tooltip 打开前的悬停延迟（ms）。默认 200。 */
    delayDuration?: number;
    class?: string;
    /** 给移植的定位元素加 class——传 z 工具类把整个 tooltip 抬到其他
     *  fixed 层之上（默认 z-50）。 */
    contentClassName?: string;
    /** true 强制打开；false 强制关闭；undefined 使用默认悬停/聚焦行为。 */
    forceOpen?: boolean;
    /** 悬停触发器时沿一个轴跟随光标——对高触发器（侧边栏栏轨）有用，
     *  居中的 tooltip 会离指针很远。另一轴仍由 `side` 锚定。 */
    followCursor?: "x" | "y";
  }>(),
  { side: "top", sideOffset: 8 }
);

const emit = defineEmits<{
  (e: "open-change", open: boolean): void;
}>();

const slots = defineSlots<{
  default?: () => VNode[];
  content?: () => VNode[];
}>();

const instance = getCurrentInstance();
const forceOpenPassed = usePropPassed("forceOpen");

const internalOpen = ref(false);
const open = computed(() => {
  if (forceOpenPassed) {
    const vnodeProps = instance?.vnode.props as Record<string, unknown> | null;
    const raw = vnodeProps ? (vnodeProps["force-open"] ?? vnodeProps["forceOpen"]) : undefined;
    if (raw !== undefined) return !!raw;
  }
  return internalOpen.value;
});
const shape = useShape();
const portalContainer = useTooltipPortalContainer();

const slideOffset = computed(() => getSlideOffset(props.side));

// 光标跟随偏移（相对触发器中心），以 motion value 驱动，
// 每次移动的更新跳过重渲染。
const followOffset = useMotionValue(0);
// 强制打开的 follow-cursor tooltip 没有光标可跟——它静止在触发器中心，
// 直到真正的指针接管。
watch(
  () => [forceOpenPassed, props.forceOpen, props.followCursor] as const,
  ([force, fo, fc]) => {
    if (force && fo && fc) followOffset.set(0);
  }
);

function handleFollowMove(event: PointerEvent) {
  if (!props.followCursor) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  followOffset.set(
    props.followCursor === "y"
      ? event.clientY - (rect.top + rect.height / 2)
      : event.clientX - (rect.left + rect.width / 2)
  );
}

function getSlideOffset(side: TooltipSide) {
  switch (side) {
    case "top":
      return { y: 4 };
    case "bottom":
      return { y: -4 };
    case "left":
      return { x: 4 };
    case "right":
      return { x: -4 };
  }
}

function handleOpenChange(v: boolean) {
  internalOpen.value = v;
  emit("open-change", v);
}

const popupClass = computed(() =>
  cn(
    // trim 让标签重新居中；仅支持 text-box 时应用加大的 padding，
    // 保持与未 trim 浏览器相同的整体高度（~26px）。
    "bg-foreground px-2 py-1 text-[12px] text-background",
    "[text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both]:py-2",
    shape.value.bg,
    props.class
  )
);

const wrapperStyle = computed(() => {
  if (props.followCursor === "y") return { y: followOffset as never };
  if (props.followCursor === "x") return { x: followOffset as never };
  return {};
});
const isAllInOne = computed(() => !!props.content || !!slots.content);
</script>

<template>
  <!-- 一体化模式：传入 content prop 或 #content 插槽 -->
  <TooltipProvider v-if="isAllInOne" :delay-duration="delayDuration ?? DEFAULT_DELAY" :skip-delay-duration="300">
    <TooltipRoot :open="open" @update:open="handleOpenChange">
      <TooltipTrigger as-child :delay-duration="delayDuration" @pointermove="handleFollowMove">
        <slot />
      </TooltipTrigger>
      <TooltipPortal :to="portalContainer ?? undefined">
        <TooltipContent
          :side="side"
          :side-offset="sideOffset"
          :class="cn('z-50', contentClassName)"
          :style="{ pointerEvents: 'none' }"
        >
          <motion.div :style="wrapperStyle">
            <motion.div
              :class="popupClass"
              :style="{ fontVariationSettings: fontWeights.medium }"
              :initial="{ opacity: 0, ...slideOffset }"
              :animate="{ opacity: 1, x: 0, y: 0 }"
              :transition="spring.fast"
            >
              <slot name="content">{{ content }}</slot>
            </motion.div>
          </motion.div>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>

  <!-- 复合模式：对标 shadcn-vue <Tooltip><TooltipTrigger /><TooltipContent /></Tooltip> -->
  <TooltipRoot v-else :open="open" :delay-duration="delayDuration ?? DEFAULT_DELAY" @update:open="handleOpenChange">
    <slot />
  </TooltipRoot>
</template>
