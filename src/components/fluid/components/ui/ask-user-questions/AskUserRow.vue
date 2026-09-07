<script setup lang="ts">
import { computed, ref, watch, type VNode, type CSSProperties } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { fontWeights } from "../../../lib/font-weight";
import { useShape } from "../../../lib/shape-context";
import { useSize } from "../../../lib/size-context";
import { setPointerFocusRedirect } from "./pointer-focus";

// ── 选项行子组件 ─────────────────────────────────────────────────────────
// 28×28 的圆角片槽位容纳编号/圆圈。行本身是 radio/checkbox（面向辅助
// 技术）；选中背景画在容器层级，让相邻选中合并成一个圆角块。

const props = withDefaults(
  defineProps<{
    index: number;
    registerItem: (index: number, element: HTMLElement | null) => void;
    role: "radio" | "checkbox" | null;
    isSelected: boolean;
    tabIndex: number;
    chipContent: VNode | string | number;
    chipFilled: boolean;
    isMulti: boolean;
    ariaLabel?: string;
    ariaChecked?: boolean;
    showArrow?: boolean;
    onArrowClick?: () => void;
    /** 正文布局："inline" 标题与描述同行；"stacked" 描述在标题下方。 */
    bodyLayout?: "inline" | "stacked";
    /** 圆角片锚定正文第一行而非垂直居中。正文可能超过一行时使用。 */
    topAlign?: boolean;
    chipPosition?: "left" | "right";
    disabled?: boolean;
  }>(),
  {
    bodyLayout: "inline",
    topAlign: false,
    chipPosition: "right",
    showArrow: false,
  }
);

const emit = defineEmits<{
  (e: "click", event: MouseEvent): void;
  (e: "keydown", event: KeyboardEvent): void;
}>();

const slots = defineSlots<{ default?: () => VNode[]; arrow?: () => VNode[] }>();

defineOptions({ name: "AskUserRow", inheritAttrs: false });

const rowRef = ref<HTMLDivElement | null>(null);
const sizeClasses = useSize();
const compact = computed(() => sizeClasses.value.variant === "compact");
const shape = useShape();
const shapeClasses = computed(() => shape.value);

function setRowRef(el: any) {
  rowRef.value = (el?.$el as HTMLDivElement | null) ?? el ?? null;
}

watch(
  [() => props.index, rowRef] as const,
  ([idx, el], _prev, onCleanup) => {
    props.registerItem(idx, el);
    onCleanup(() => props.registerItem(idx, null));
  },
  { immediate: true }
);

// 提交箭头覆盖层：不管落在哪个槽位动画一致。
const arrowVisible = computed(() => props.showArrow);

// 圆角片在 topAlign 时上浮，让片的垂直中心对齐 13px 首行的中心；
// stacked 布局留回 4px 呼吸空间，让片靠近标题基线而不是光学中心。
const chipAlignShift = computed(() => {
  if (!props.topAlign) return "";
  return props.bodyLayout === "stacked" ? "-mt-[1px]" : "-mt-[5px]";
});

const chipSize = computed(() => (compact.value ? "w-6 h-6" : "w-7 h-7"));
const chipInnerSize = computed(() => (compact.value ? "w-[18px] h-[18px]" : "w-5 h-5"));

const chipClass = computed(() =>
  cn(
    "absolute inline-flex items-center justify-center text-[11px] transition-[opacity,font-variation-settings] duration-80",
    chipInnerSize.value,
    props.isMulti && shapeClasses.value.bg,
    props.isMulti
      ? props.chipFilled
        ? "bg-foreground text-background"
        : "border border-border text-muted-foreground"
      : props.chipFilled
        ? "text-foreground"
        : "text-muted-foreground",
    // 只有片与箭头共槽（片在右）时才淡出片；片在左时箭头有自己的右槽。
    props.chipPosition === "right" && arrowVisible.value && "opacity-0"
  )
);

const chipStyle = computed<CSSProperties>(() => ({
  fontVariationSettings: props.chipFilled ? fontWeights.semibold : fontWeights.medium,
}));

const rowClass = computed(() =>
  cn(
    "relative z-10 flex select-none outline-none",
    props.chipPosition === "left" ? "gap-2" : "gap-3",
    props.topAlign ? "items-start" : "items-center",
    props.bodyLayout === "stacked"
      ? compact.value
        ? "min-h-12 py-1.5"
        : "min-h-14 py-2"
      : compact.value
        ? "min-h-8 py-1"
        : "min-h-10 py-1.5",
    props.chipPosition === "left"
      ? props.isMulti
        ? "pl-1.5 pr-3"
        : "pl-1.5 pr-1.5"
      : "pl-3 pr-1.5",
    !props.disabled && "cursor-pointer",
    shapeClasses.value.item
  )
);

function handleMouseDown(e: MouseEvent) {
  // 点击落在隐藏的 sr-only 原语上时原生会聚焦它（点击目标的最近可聚焦
  // 祖先），之后键盘导航会在隐形控件上死区。阻止原生聚焦（click 仍会
  // 触发）并把焦点落在行上。真正可交互的子元素（Other 行的 textarea）
  // 例外——它们必须从点击中拿焦点。
  const target = e.target as HTMLElement;
  const interactive = target.closest(
    'button:not([tabindex="-1"]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (interactive && interactive !== e.currentTarget) return;
  e.preventDefault();
  // 标记重定向，让容器的 focusin 知道焦点来自指针而非键盘（浏览器无法
  // 区分——脚本 focus() 会被 :focus-visible 命中并画出焦点环）。
  setPointerFocusRedirect(true);
  try {
    (e.currentTarget as HTMLElement).focus();
  } finally {
    setPointerFocusRedirect(false);
  }
}
</script>

<template>
  <div
    :ref="setRowRef"
    :data-proximity-index="index"
    :data-state="isSelected ? 'checked' : 'unchecked'"
    :role="role ?? undefined"
    :aria-checked="role === 'radio' || role === 'checkbox' ? !!ariaChecked : undefined"
    :aria-label="ariaLabel"
    :tabindex="tabIndex"
    :class="rowClass"
    @mousedown="handleMouseDown"
    @click="emit('click', $event)"
    @keydown="emit('keydown', $event)"
  >
    <!-- 选中背景画在容器层级，让相邻选中合并为单一圆角块；行保持 z-10。 -->

    <span
      v-if="chipPosition === 'left'"
      :class="
        cn(
          'relative inline-flex shrink-0 items-center justify-center',
          chipSize,
          chipAlignShift
        )
      "
    >
      <span aria-hidden="true" :class="chipClass" :style="chipStyle">
        {{ chipContent }}
      </span>
    </span>

    <!-- 正文——填满行 -->
    <span
      :class="
        cn(
          'min-w-0 flex-1 leading-snug',
          sizeClasses.text,
          bodyLayout === 'stacked'
            ? 'flex flex-col gap-0.5'
            : 'inline-flex items-center gap-0'
        )
      "
    >
      <slot />
    </span>

    <span
      v-if="chipPosition === 'right'"
      :class="
        cn(
          'relative inline-flex shrink-0 items-center justify-center',
          chipSize,
          chipAlignShift
        )
      "
    >
      <span aria-hidden="true" :class="chipClass" :style="chipStyle">
        {{ chipContent }}
      </span>
      <AnimatePresence>
        <motion.span
          v-if="arrowVisible"
          :aria-hidden="!onArrowClick"
          :role="onArrowClick ? 'button' : undefined"
          :class="
            cn(
              'absolute inset-0 inline-flex items-center justify-center bg-foreground text-background',
              shape.bg,
              onArrowClick && 'cursor-pointer'
            )
          "
          :initial="{ opacity: 0, scale: 0.6 }"
          :animate="{ opacity: 1, scale: 1 }"
          :exit="{ opacity: 0, scale: 0.6, transition: spring.fast.exit }"
          :transition="{ ...spring.fast, opacity: { duration: 0.08 } }"
          @click.stop="onArrowClick?.()"
        >
          <slot name="arrow" />
        </motion.span>
      </AnimatePresence>
    </span>

    <span
      v-if="chipPosition === 'left' && !isMulti"
      :class="
        cn(
          'relative inline-flex shrink-0 items-center justify-center',
          chipSize,
          chipAlignShift
        )
      "
    >
      <AnimatePresence>
        <motion.span
          v-if="arrowVisible"
          :aria-hidden="!onArrowClick"
          :role="onArrowClick ? 'button' : undefined"
          :class="
            cn(
              'absolute inset-0 inline-flex items-center justify-center bg-foreground text-background',
              shape.bg,
              onArrowClick && 'cursor-pointer'
            )
          "
          :initial="{ opacity: 0, scale: 0.6 }"
          :animate="{ opacity: 1, scale: 1 }"
          :exit="{ opacity: 0, scale: 0.6, transition: spring.fast.exit }"
          :transition="{ ...spring.fast, opacity: { duration: 0.08 } }"
          @click.stop="onArrowClick?.()"
        >
          <slot name="arrow" />
        </motion.span>
      </AnimatePresence>
    </span>
  </div>
</template>
