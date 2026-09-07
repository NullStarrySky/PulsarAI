<script setup lang="ts">
import { computed, ref, onUnmounted, type VNode } from "vue";
import { motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { fontWeights } from "../../../lib/font-weight";
import { useShape } from "../../../lib/shape-context";
import { useSize } from "../../../lib/size-context";
import { useIcon } from "../../../lib/icon-context";
import type { StepStatus } from "./thinking-steps-context";

// ─── ThinkingStep ────────────────────────────────────────────────────────
// 单个步骤行：图标/圆点列 + 连续连接线 + 文本。active 状态标签带
// shimmer 与「…」。pending 状态不渲染（步骤逐个出现）。

const props = withDefaults(
  defineProps<{
    /** 步骤图标（库图标名）。 */
    icon?: string;
    showIcon?: boolean;
    label: string;
    description?: string;
    status?: StepStatus;
    /** 内容淡入延迟（秒）。 */
    delay?: number;
    isLast?: boolean;
    class?: string;
  }>(),
  { icon: "dot", showIcon: true, status: "complete", delay: 0.08, isLast: false }
);

const slots = defineSlots<{ default?: () => VNode[] }>();

defineOptions({ name: "ThinkingStep" });

const Icon = useIcon((props.icon || "dot") as any);
const shape = useShape();
const sizeClasses = useSize();

// 步骤展开动画的测量布局高度。height: "auto" 由 motion 从视觉尺寸解析，
// 在缩放祖先下会冲过真实高度再弹回——整个列表在搭建时会明显过冲。
// offsetHeight 与 ResizeObserver 对 transform 免疫。
const stepRef = ref<HTMLDivElement | null>(null);
let ro: ResizeObserver | null = null;
const stepHeight = ref<number | null>(null);

function setStepRef(el: any) {
  const inner = (el?.$el as HTMLDivElement | null) ?? el ?? null;
  stepRef.value = inner;
  ro?.disconnect();
  ro = null;
  if (!inner) return;
  const sync = () => {
    if (inner.offsetHeight > 0) stepHeight.value = inner.offsetHeight;
  };
  sync();
  ro = new ResizeObserver(sync);
  ro.observe(inner);
}

onUnmounted(() => {
  ro?.disconnect();
  ro = null;
});

const isActive = computed(() => props.status === "active");
</script>

<template>
  <!-- 外层：高度动画平滑腾出空间 -->
  <motion.div
    v-if="status !== 'pending'"
    :class="cn('relative z-10 overflow-hidden', props.class)"
    :initial="{ height: 0 }"
    :animate="{ height: stepHeight ?? 0 }"
    :transition="spring.slow"
  >
    <!-- 内层：在空间开始打开后淡入内容——同时也是上面高度的测量元素 -->
    <motion.div
      :ref="setStepRef"
      :initial="{ opacity: 0 }"
      :animate="{ opacity: 1 }"
      :transition="{ duration: 0.24, delay: props.delay, ease: 'easeOut' }"
    >
      <div :class="cn('flex gap-2.5 px-2 py-1.5', shape.item)">
        <!-- 图标列 + 连续连接线 -->
        <div class="flex w-[14px] shrink-0 flex-col items-center">
          <div class="pt-0.5">
            <component
              :is="Icon"
              v-if="showIcon"
              :size="sizeClasses.variant === 'compact' ? 12 : 14"
              :stroke-width="1.5"
              class="text-muted-foreground"
            />
            <div v-else class="flex h-[14px] w-[14px] items-center justify-center">
              <div class="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
            </div>
          </div>
          <!-- 连接线从图标延伸到本步骤底部 -->
          <div v-if="!isLast" class="mt-1 w-px flex-1 bg-border/60" />
        </div>

        <!-- 文本内容 -->
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <span
            :class="
              cn(
                sizeClasses.text,
                'leading-tight text-foreground',
                isActive && 'shimmer-text'
              )
            "
            :style="{ fontVariationSettings: fontWeights.medium }"
          >
            {{ label }}{{ isActive ? "…" : "" }}
          </span>
          <span
            v-if="description"
            :class="cn(sizeClasses.text, 'leading-snug text-muted-foreground')"
          >
            {{ description }}
          </span>
          <slot />
        </div>
      </div>
    </motion.div>
  </motion.div>
</template>
