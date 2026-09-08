<script setup lang="ts">
import { computed, ref, unref, watch, onUnmounted, useAttrs } from "vue";
import {
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogClose,
} from "reka-ui";
import { motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { useIcon } from "../../../lib/icon-context";
import { spring, exitFallbackMs } from "../../../lib/springs";
import { useShape } from "../../../lib/shape-context";
import { useSizeVariant } from "../../../lib/size-context";
import { provideSurface, useSurface } from "../../../lib/surface-context";
import { surfaceClasses } from "../../../lib/surface-classes";
import { useDialogOpen } from "./dialog-context";
import Button from "../button/Button.vue";

const DIALOG_OFFSET = 4;

const props = withDefaults(
  defineProps<{
    size?: "sm" | "lg";
    /** Portal 目标。设置后 overlay 与面板渲染在此元素内（position absolute）
     *  而不是覆盖视口（fixed）。与 `position: relative; overflow: hidden`
     *  的容器配对——通常再加 `<Dialog :modal="false">`——把对话框限定在
     *  有界区域内。默认文档 body / 全视口行为。 */
    container?: HTMLElement | null;
    /** 是否显示右上角的默认关闭按钮。@default true */
    showCloseButton?: boolean;
    /** 是否自定义定位与尺寸（如支持拖拽、自定坐标的弹窗），避免默认居中与 transform 覆盖。 */
    customPosition?: boolean;
    style?: unknown;
    class?: string;
  }>(),
  { size: "sm", showCloseButton: true, customPosition: false }
);

const XIcon = useIcon("x");
const open = useDialogOpen();
const shape = useShape();
const substrate = useSurface();
const dialogLevel = computed(() => Math.min(substrate.value + DIALOG_OFFSET, 8));
// 尺寸阶梯在紧凑区域把对话框收窄一档——只影响宽度，内边距不动（见 /docs/sizes）。
const compact = computed(() => useSizeVariant().value === "compact");
const mounted = ref(false);

watch(
  open,
  (o) => {
    if (o) mounted.value = true;
  },
  { immediate: true }
);

// 延迟卸载的后备释放：面板的 onAnimationComplete 是主信号，
// 但 rAF 驱动的动画回调在节流/后台标签页里可能停摆——留下一个不可见的
// 全屏 overlay（和滚动锁）。两个退出动画都跑 spring.slow.exit，
// 后备追踪该档。
watch(open, (o) => {
  if (o) return;
  const id = setTimeout(() => (mounted.value = false), exitFallbackMs(spring.slow));
  return () => clearTimeout(id);
});

onUnmounted(() => {
  mounted.value = false;
});

function handleExitComplete() {
  if (!open.value) mounted.value = false;
}

const overlayClass = computed(() =>
  cn(props.container ? "absolute" : "fixed", "inset-0 z-40 bg-black/40 dark:bg-black/80")
);

const contentClass = computed(() =>
  cn(
    props.container ? "absolute" : "fixed",
    "z-50 pointer-events-auto",
    !props.customPosition && "left-1/2 top-1/2 w-[calc(100%-2rem)]",
    surfaceClasses(dialogLevel.value),
    "p-6 focus:outline-none",
    !props.customPosition && props.size === "sm" && (compact.value ? "max-w-[360px]" : "max-w-[400px]"),
    !props.customPosition && props.size === "lg" && (compact.value ? "max-w-[480px]" : "max-w-[540px]"),
    shape.value.container,
    props.class
  )
);

const transition = computed(() => (open.value ? spring.slow : spring.slow.exit));

const attrs = useAttrs();
const mergedStyle = computed<Record<string, any>>(() => {
  const result: Record<string, any> = {};
  const propStyle = unref(props.style);
  if (propStyle && typeof propStyle === "object") {
    Object.assign(result, propStyle);
  }
  const attrStyle = unref(attrs.style);
  if (attrStyle && typeof attrStyle === "object") {
    Object.assign(result, attrStyle);
  }
  return result;
});

// 面板内部的表面层级抬升 DIALOG_OFFSET。
provideSurface(dialogLevel);
</script>

<template>
  <template v-if="mounted">
    <DialogPortal force-mount :to="container ?? undefined">
      <DialogOverlay as-child force-mount>
        <motion.div
          :class="overlayClass"
          :initial="{ opacity: 0 }"
          :animate="{ opacity: open ? 1 : 0 }"
          :transition="transition"
        />
      </DialogOverlay>
      <DialogContent as-child force-mount>
        <motion.div
          v-bind="$attrs"
          :class="contentClass"
          :style="mergedStyle"
          :initial="props.customPosition ? { opacity: 0, scale: 0.97 } : { opacity: 0, scale: 0.97, x: '-50%', y: '-50%' }"
          :animate="props.customPosition ? { opacity: open ? 1 : 0, scale: open ? 1 : 0.97 } : {
            opacity: open ? 1 : 0,
            scale: open ? 1 : 0.97,
            x: '-50%',
            y: '-50%',
          }"
          :transition="transition"
          :on-animation-complete="handleExitComplete"
        >
          <slot />
          <DialogClose v-if="showCloseButton" as-child>
            <Button variant="ghost" size="icon-sm" class="absolute right-3 top-3">
              <XIcon />
              <span class="sr-only">Close</span>
            </Button>
          </DialogClose>
        </motion.div>
      </DialogContent>
    </DialogPortal>
  </template>
</template>
