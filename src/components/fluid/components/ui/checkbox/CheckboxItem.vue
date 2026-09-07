<script setup lang="ts">
import { computed, ref, watch, type HTMLAttributes } from "vue";
import { CheckboxRoot } from "reka-ui";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { fontWeights } from "../../../lib/font-weight";
import { useShape } from "../../../lib/shape-context";
import { useSize } from "../../../lib/size-context";
import { useCheckboxGroup } from "./checkbox-group-context";

const props = withDefaults(
  defineProps<{
    label?: string;
    index?: number;
    checked: boolean;
    disabled?: boolean;
    class?: HTMLAttributes["class"];
  }>(),
  {}
);

const emit = defineEmits<{
  (e: "toggle"): void;
}>();

const internalRef = ref<HTMLDivElement | null>(null);
const hasMounted = ref(false);
const checkboxGroupCtx = useCheckboxGroup();
const { registerItem, activeIndex } = checkboxGroupCtx;

const claimedIndex = ref<number>(props.index ?? -1);
if (claimedIndex.value === -1 && checkboxGroupCtx?.claimIndex) {
  claimedIndex.value = checkboxGroupCtx.claimIndex();
}
const resolvedIndex = computed(() => props.index ?? claimedIndex.value);

watch(
  [resolvedIndex, internalRef] as const,
  ([index, el], _prev, onCleanup) => {
    if (index < 0) return;
    registerItem(index, el);
    onCleanup(() => registerItem(index, null));
  },
  { immediate: true }
);

queueMicrotask(() => {
  hasMounted.value = true;
});

defineOptions({ name: "CheckboxItem" });

const isActive = computed(() => activeIndex.value === resolvedIndex.value);
const skipAnimation = computed(() => !hasMounted.value);
const shape = useShape();
const sizeClasses = useSize();
const compact = computed(() => sizeClasses.value.variant === "compact");

function setItemRef(el: any) {
  internalRef.value = (el?.$el as HTMLDivElement | null) ?? el ?? null;
}

function handleMousedown(e: MouseEvent) {
  // 点击 15px 的 checkbox 方块会原生聚焦到隐藏原语（点击目标的最近可聚焦
  // 祖先），之后方向键导航死区：组的 keydown 处理器无法在行包裹层中找到
  // 目标。阻止原生焦点移动（click 仍会触发），把焦点落在行上。跳过真正
  // 可交互的子元素，避免劫持它们的焦点。
  const target = e.target as HTMLElement;
  const interactive = target.closest(
    'button:not([tabindex="-1"]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (interactive && interactive !== e.currentTarget) return;
  e.preventDefault();
  (e.currentTarget as HTMLElement).focus();
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    emit("toggle");
  }
}

function handleToggle() {
  emit("toggle");
}
</script>

<template>
  <div
    :ref="setItemRef"
    :data-proximity-index="resolvedIndex"
    tabindex="0"
    role="checkbox"
    :aria-checked="checked"
    :aria-label="label"
    :aria-disabled="disabled || undefined"
    :class="
      cn(
        `relative z-10 flex ${sizeClasses.control} items-center ${sizeClasses.gap} ${shape.item} ${sizeClasses.px} cursor-pointer outline-none whitespace-nowrap`,
        disabled && 'pointer-events-none opacity-50',
        props.class
      )
    "
    @click="handleToggle"
    @mousedown="handleMousedown"
    @keydown="handleKeydown"
  >
    <!-- Checkbox —— reka 原语只承担可访问性，视觉全部自绘 -->
    <CheckboxRoot
      :model-value="checked"
      tabindex="-1"
      aria-hidden="true"
      :class="
        cn(
          'relative shrink-0 appearance-none cursor-pointer border-0 bg-transparent p-0 outline-none',
          compact ? 'h-[14px] w-[14px]' : 'h-[16px] w-[16px]'
        )
      "
      @click.stop="handleToggle"
    >
      <!-- 边框 -->
      <div
        :class="
          cn(
            'absolute inset-0 border-solid transition-all duration-80',
            compact ? 'rounded-[4px]' : 'rounded-[5px]',
            checked
              ? 'border-[1.5px] border-transparent'
              : isActive
                ? 'border-[1.5px] border-neutral-400 dark:border-neutral-500'
                : 'border-[1.5px] border-border'
          )
        "
      />
      <!-- 勾选标记 -->
      <AnimatePresence>
        <motion.svg
          v-if="checked"
          :width="compact ? 16 : 18"
          :height="compact ? 16 : 18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          :stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-foreground"
          :initial="{ opacity: 1 }"
          :animate="{ opacity: 1 }"
          :exit="{ opacity: 1 }"
        >
          <motion.path
            d="M6 12L10 16L18 8"
            :initial="{ pathLength: skipAnimation ? 1 : 0 }"
            :animate="{
              pathLength: 1,
              transition: { duration: 0.08, ease: 'easeOut' },
            }"
            :exit="{
              pathLength: 0,
              transition: { duration: 0.04, ease: 'easeIn' },
            }"
          />
        </motion.svg>
      </AnimatePresence>
    </CheckboxRoot>

    <!-- 标签 -->
    <template v-if="$slots.default">
      <span
        :class="
          cn(
            'inline-flex items-center gap-1.5 transition-[color,font-variation-settings] duration-80',
            sizeClasses.text,
            checked || isActive ? 'text-foreground' : 'text-muted-foreground'
          )
        "
        :style="{
          fontVariationSettings: checked ? fontWeights.semibold : fontWeights.normal,
        }"
      >
        <slot />
      </span>
    </template>
    <span v-else-if="label" :class="cn('inline-grid', sizeClasses.text)">
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
            checked || isActive ? 'text-foreground' : 'text-muted-foreground'
          )
        "
        :style="{
          fontVariationSettings: checked ? fontWeights.semibold : fontWeights.normal,
        }"
      >
        {{ label }}
      </span>
    </span>
  </div>
</template>
