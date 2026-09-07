<script setup lang="ts">
import { computed, ref, watch, onUnmounted, type VNode } from "vue";
import { CollapsibleContent } from "reka-ui";
import { motion, useReducedMotion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { useSize } from "../../../lib/size-context";

// ─── 共享折叠部件：面板 ─────────────────────────────────────────────────
// 带弹簧的高度动画。打开高度动画到自行测量的 LAYOUT 像素值而非
// height: "auto"——motion 从元素的视觉（transform 后）尺寸解析 auto，
// 在缩放祖先下会冲过头再弹回。offsetHeight 与 ResizeObserver 对 transform
// 免疫（与 accordion 同一套安排）。

const props = defineProps<{
  open: boolean;
  contentClass?: string;
}>();

const slots = defineSlots<{ default?: () => VNode[] }>();

defineOptions({ name: "CollapsePanel" });

const sizeClasses = useSize();
const compactStep = computed(() => sizeClasses.value.variant === "compact");
const prefersReducedMotion = useReducedMotion();
const reduceMotion = computed(() => prefersReducedMotion.value ?? false);

const innerRef = ref<HTMLDivElement | null>(null);
let ro: ResizeObserver | null = null;
const contentHeight = ref<number | null>(null);
// 挂载即打开的面板以 initial "auto" 渲染，一拍后才拿到第一个像素目标；
// 这次交接必须 SNAP（duration 0）而不是弹簧。之后才打开的面板正常弹簧。
const needsSnap = ref(props.open);

function setInnerRef(el: any) {
  const inner = (el?.$el as HTMLDivElement | null) ?? el ?? null;
  innerRef.value = inner;
  ro?.disconnect();
  ro = null;
  if (!inner) return;
  if (inner.offsetHeight > 0) contentHeight.value = inner.offsetHeight;
  ro = new ResizeObserver(() => {
    // 忽略面板 display:none 时触发的 0。
    if (inner.offsetHeight > 0) contentHeight.value = inner.offsetHeight;
  });
  ro.observe(inner);
}

// 打开时同步（绘制前）重测，让弹簧目标从第一帧起就是新鲜布局高度。
watch(
  () => props.open,
  (open) => {
    if (open && innerRef.value && innerRef.value.offsetHeight > 0) {
      contentHeight.value = innerRef.value.offsetHeight;
    }
  }
);

watch(contentHeight, (h) => {
  if (h !== null) needsSnap.value = false;
});

// 内容保持挂载以便测量；完全关闭的面板在退出动画结束后 display:none。
const exitComplete = ref(!props.open);
watch(
  () => props.open,
  (open) => {
    if (open && exitComplete.value) exitComplete.value = false;
  }
);

onUnmounted(() => {
  ro?.disconnect();
  ro = null;
});

const height = computed(() => (props.open ? contentHeight.value ?? 0 : 0));

// bounce: 0——纯高度动画不带过冲更好看。
const transition = computed(() => {
  if (needsSnap.value || reduceMotion.value) return { duration: 0 };
  return { ...spring.moderate, bounce: 0 };
});

function handleAnimationComplete() {
  if (!props.open) exitComplete.value = true;
}
</script>

<template>
  <CollapsibleContent force-mount as-child>
    <motion.div
      :hidden="!props.open && exitComplete"
      class="overflow-hidden"
      :initial="{ height: props.open ? 'auto' : 0 }"
      :animate="{ height }"
      :transition="transition"
      :on-animation-complete="handleAnimationComplete"
    >
      <div
        :ref="setInnerRef"
        :class="
          cn(
            'px-3 pb-3 pt-1 text-muted-foreground',
            compactStep ? 'text-[12px]' : 'text-[13px]',
            contentClass
          )
        "
      >
        <slot />
      </div>
    </motion.div>
  </CollapsibleContent>
</template>
