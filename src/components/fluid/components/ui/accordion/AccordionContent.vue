<script setup lang="ts">
import { computed, ref, watch, onUnmounted, useTemplateRef, type HTMLAttributes } from "vue";
import { AccordionContent as AccordionContentPrimitive } from "reka-ui";
import { motion, useReducedMotion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { useSize } from "../../../lib/size-context";
import { useAccordionGroup, useAccordionItemContext } from "./accordion-context";

defineProps<{ class?: HTMLAttributes["class"] }>();

const groupCtx = useAccordionGroup();
const { isOpen } = useAccordionItemContext();
const sizeClasses = useSize();
// 在这里读取而不是依赖消费方可能没装的 MotionConfig：height 是位置值，
// 否则 motion 会为减弱动效用户把它也动画掉。
const prefersReducedMotion = useReducedMotion();
const reduceMotion = computed(() => prefersReducedMotion.value ?? false);

// 打开高度动画到自行测量的 LAYOUT 像素值，而不是 height: "auto"：
// motion 解析 "auto" 目标时测量的是元素的*视觉*（transform 后）尺寸，
// 在缩放的祖先下（例如 demo 的 1.7x 卡片）动画会冲过头到 scale× 真实高度，
// 最终 "auto" 落地时又弹回——每次展开结尾都有一次可见的高度收缩。
// offsetHeight 与 ResizeObserver 对 transform 免疫。
const innerRef = useTemplateRef<HTMLDivElement | null>("innerRef");
let ro: ResizeObserver | null = null;
const contentHeight = ref<number | null>(null);
// 挂载即打开的 item 以 initial "auto" 渲染，一拍之后才拿到第一个像素目标；
// 这次交接必须 SNAP（duration 0）而不是弹簧——motion 会以视觉（缩放后的）
// 尺寸测量弹簧的数字起点并播放一次收缩。之后才打开的 item 正常弹簧。
const needsSnap = ref(isOpen.value);
// 高度只在本面板切换时弹簧。当 contentHeight 在面板之下变化时——面板里
// 任何可折叠的东西，包括另一个 accordion——必须 SNAP：每帧都重定向的弹簧
// 会追赶子元素自己的动画，晚于它落地，并把 item 下方的一切拖迟到后面。
let prevOpen = isOpen.value;
const toggling = ref(false);
watch(isOpen, (open) => {
  if (prevOpen !== open) {
    prevOpen = open;
    toggling.value = true;
  }
});

const measureCb = (el: any) => {
  const inner = (el?.$el as HTMLDivElement | null) ?? el ?? null;
  ro?.disconnect();
  ro = null;
  if (!inner) return;
  if (inner.offsetHeight > 0) contentHeight.value = inner.offsetHeight;
  const observer = new ResizeObserver(() => {
    // 忽略面板 display:none 时触发的 0。
    if (inner.offsetHeight > 0) contentHeight.value = inner.offsetHeight;
  });
  observer.observe(inner);
  ro = observer;
};

// 打开时同步（绘制前）重测，让弹簧的目标从第一帧起就是新鲜的布局高度。
watch(isOpen, (open) => {
  if (open && innerRef.value && innerRef.value.offsetHeight > 0) {
    contentHeight.value = innerRef.value.offsetHeight;
  }
});

watch(contentHeight, (h) => {
  if (h !== null) needsSnap.value = false;
});

// 内容保持挂载以便测量；完全关闭的面板在退出动画结束后 display:none（hidden），
// 既不进入无障碍树也不会截断动画。
const exitComplete = ref(!isOpen.value);
watch(isOpen, (open) => {
  if (open && exitComplete.value) {
    // 在打开动画首帧绘制前解除隐藏。
    exitComplete.value = false;
  }
});

onUnmounted(() => {
  ro?.disconnect();
  ro = null;
});

const height = computed(() => (isOpen.value ? contentHeight.value ?? 0 : 0));

const transition = computed(() => {
  if (needsSnap.value || reduceMotion.value || !toggling.value) {
    return { duration: 0 };
  }
  return isOpen.value
    ? { ...spring.fast, opacity: { duration: 0.06 } }
    : { ...spring.fast.exit, opacity: { duration: 0.04 } };
});

function handleUpdate() {
  groupCtx?.remeasure();
}

function handleAnimationComplete() {
  toggling.value = false;
  groupCtx?.remeasure();
  if (!isOpen.value) exitComplete.value = true;
}
</script>

<template>
  <AccordionContentPrimitive force-mount as-child>
    <motion.div
      :hidden="!isOpen && exitComplete"
      :class="cn('overflow-hidden', $props.class)"
      :initial="{ height: isOpen ? 'auto' : 0 }"
      :animate="{
        height,
        opacity: isOpen ? 1 : 0,
      }"
      :transition="transition"
      :on-update="handleUpdate"
      :on-animation-complete="handleAnimationComplete"
    >
      <div
        :ref="measureCb"
        :class="
          cn(
            'pt-1 text-muted-foreground',
            sizeClasses.px,
            sizeClasses.text,
            sizeClasses.variant === 'compact' ? 'pb-2.5' : 'pb-3'
          )
        "
      >
        <slot />
      </div>
    </motion.div>
  </AccordionContentPrimitive>
</template>
