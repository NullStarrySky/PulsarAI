<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { TabsTrigger } from "reka-ui";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { fontWeights } from "../../../lib/font-weight";
import { useShape } from "../../../lib/shape-context";
import { useSize } from "../../../lib/size-context";
import type { IconComponent } from "../../../lib/icon-context";
import { useTabsSubtle } from "./tabs-subtle-context";

// ─── TabsSubtleItem ───────────────────────────────────────────────────────
// 单个 subtle tab：可选图标 + 可变字重标签。activeLabel 模式下未选中的
// tab 收起标签（宽度弹簧动画到测量出的布局宽度，而非 "auto"——motion 从
// 元素的视觉（transform 后）尺寸解析 auto，在缩放祖先下会冲过头再弹回）。

const props = defineProps<{
  /** 可选前导图标（activeLabel 模式必需）。 */
  icon?: IconComponent;
  label: string;
  /** 在 TabsSubtle 中的索引（受控契约的一部分）。 */
  index: number;
  class?: string;
}>();

defineOptions({ name: "TabsSubtleItem" });

const internalRef = ref<HTMLButtonElement | null>(null);
const shape = useShape();
const sizeClasses = useSize();
const { registerTab, hoveredIndex, selectedIndex, activeLabel, idPrefix } = useTabsSubtle();

const value = computed(() => `t-${props.index}`);
const triggerId = computed(() => (idPrefix ? `${idPrefix}-tab-${props.index}` : undefined));
const ariaControls = computed(() => (idPrefix ? `${idPrefix}-panel-${props.index}` : undefined));

function setTriggerRef(el: any) {
  internalRef.value = (el?.$el as HTMLButtonElement | null) ?? el ?? null;
}

watch(
  [() => props.index, internalRef] as const,
  ([idx, el], _prev, onCleanup) => {
    registerTab(idx, el);
    onCleanup(() => registerTab(idx, null));
  },
  { immediate: true }
);

const isSelected = computed(() => selectedIndex.value === props.index);
const isActive = computed(() => hoveredIndex.value === props.index || isSelected.value);
const collapseLabel = computed(() => activeLabel && !!props.icon);
const showLabel = computed(() => !collapseLabel.value || isSelected.value);

// 折叠标签动画到测量出的 LAYOUT 宽度，而非 "auto"：motion 从元素的视觉
// （transform 后）尺寸解析 auto 目标，在缩放祖先（如 demo 的 1.76x 卡片）
// 下会冲过真实宽度再弹回。offsetWidth 与 ResizeObserver 对 transform 免疫
// ——与 accordion 的高度动画同一套安排。
const labelWidth = ref<number | null>(null);
let labelRo: ResizeObserver | null = null;
function measureLabel(el: any) {
  const span = (el?.$el as HTMLSpanElement | null) ?? el ?? null;
  labelRo?.disconnect();
  labelRo = null;
  if (!span) return;
  const update = () => {
    labelWidth.value = span.offsetWidth;
  };
  update();
  labelRo = new ResizeObserver(update);
  labelRo.observe(span);
}
</script>

<template>
  <TabsTrigger
    :ref="setTriggerRef"
    :value="value"
    :data-proximity-index="index"
    :id="triggerId"
    :aria-controls="ariaControls"
    :aria-label="collapseLabel && !showLabel ? label : undefined"
    :class="
      cn(
        // 固定高度，让标签上的 text-box trim 不收缩 tab。独立 pill 直接
        // 坐在阶梯的 control 高度上。
        'relative z-10 flex cursor-pointer items-center border-none bg-transparent outline-none',
        sizeClasses.control,
        sizeClasses.px,
        !collapseLabel && sizeClasses.gap,
        shape.bg,
        props.class
      )
    "
  >
    <component
      :is="icon"
      v-if="icon"
      :size="sizeClasses.icon"
      :stroke-width="isActive ? 2 : 1.5"
      :class="
        cn(
          'shrink-0 transition-[color,stroke-width] duration-80',
          isActive ? 'text-foreground' : 'text-muted-foreground'
        )
      "
    />
    <AnimatePresence :initial="false">
      <motion.span
        v-if="collapseLabel && showLabel"
        key="label"
        class="overflow-hidden"
        :initial="{ width: 0, opacity: 0, marginLeft: 0 }"
        :animate="{
          ...(labelWidth != null ? { width: labelWidth } : { width: 'auto' }),
          opacity: 1,
          // 对齐阶梯的图标-标签间距（gap-2 / gap-1.5）。
          marginLeft: sizeClasses.variant === 'compact' ? 6 : 8,
        }"
        :exit="{ width: 0, opacity: 0, marginLeft: 0 }"
        :transition="{ ...spring.fast, opacity: { duration: 0.06 } }"
      >
        <span
          :ref="measureLabel"
          :class="cn('inline-grid whitespace-nowrap', sizeClasses.text)"
        >
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
                isActive ? 'text-foreground' : 'text-muted-foreground'
              )
            "
            :style="{
              fontVariationSettings: isSelected
                ? fontWeights.semibold
                : fontWeights.normal,
            }"
          >
            {{ label }}
          </span>
        </span>
      </motion.span>
    </AnimatePresence>
    <span
      v-if="!collapseLabel"
      :class="cn('inline-grid whitespace-nowrap', sizeClasses.text)"
    >
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
            isActive ? 'text-foreground' : 'text-muted-foreground'
          )
        "
        :style="{
          fontVariationSettings: isSelected ? fontWeights.semibold : fontWeights.normal,
        }"
      >
        {{ label }}
      </span>
    </span>
  </TabsTrigger>
</template>
