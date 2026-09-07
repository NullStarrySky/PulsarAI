<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from "vue";
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
} from "reka-ui";
import { motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring, exitFallbackMs } from "../../../lib/springs";
import { fontWeights } from "../../../lib/font-weight";
import { useShape } from "../../../lib/shape-context";
import { provideSize, useSize, type SizeVariant } from "../../../lib/size-context";
import { surfaceClasses } from "../../../lib/surface-classes";
import { useSurface, provideSurface } from "../../../lib/surface-context";
import { useIcon } from "../../../lib/icon-context";
import ColorPicker from "./ColorPicker.vue";
import { parseColor, rgbToHexStr, type ParsedColor, type ColorFormat } from "./color-math";
import { usePropPassed } from "../../../lib/prop-passed";

// ─── ColorPickerPopover（触发按钮 + 弹出面板）──────────────────────────
// reka Popover 负责定位（锚点跟随 + 碰撞翻转）、关闭（外点按下、Esc）
// 与焦点管理。弹簧开合期间 portal 保持挂载（延迟卸载兜底——rAF 驱动的
// 动画回调在后台标签页可能停滞）。

const props = withDefaults(
  defineProps<{
    value?: string;
    defaultValue?: string;
    format?: ColorFormat;
    defaultFormat?: ColorFormat;
    swatches?: string[];
    hideEyedropper?: boolean;
    triggerLabel?: string;
    triggerLabelPosition?: "left" | "right";
    triggerShowValue?: boolean;
    triggerShowRemove?: boolean;
    open?: boolean;
    defaultOpen?: boolean;
    size?: SizeVariant;
    class?: string;
    triggerClassName?: string;
  }>(),
  {
    defaultValue: "#6B97FF",
    defaultFormat: "hex",
    triggerLabelPosition: "left",
    triggerShowValue: true,
    triggerShowRemove: false,
    defaultOpen: false,
  }
);

const emit = defineEmits<{
  (e: "update:value", value: string, parsed: ParsedColor): void;
  (e: "update:format", format: ColorFormat): void;
  (e: "update:open", open: boolean): void;
  (e: "trigger-remove"): void;
}>();

defineOptions({ name: "ColorPickerPopover", inheritAttrs: false });

const XIcon = useIcon("x");

const openPassed = usePropPassed("open");
const internalOpen = ref(props.defaultOpen);
const open = computed(() => (openPassed ? !!props.open : internalOpen.value));

function handleOpenChange(next: boolean) {
  if (!openPassed) internalOpen.value = next;
  emit("update:open", next);
}

// portal 生命周期：open 翻 true 即挂载；关闭时保持挂载（forceMount）
// 直到退出动画播完。onAnimationComplete 是主信号；延迟卸载兜底覆盖
// rAF 停摆的后台标签页。
const mounted = ref(false);
watch(
  open,
  (o) => {
    if (o) mounted.value = true;
  },
  { immediate: true }
);
watch(open, (o) => {
  if (o) return;
  const id = setTimeout(() => (mounted.value = false), exitFallbackMs(spring.moderate));
  return () => clearTimeout(id);
});
onUnmounted(() => {
  mounted.value = false;
});

const shape = useShape();
const sizeClasses = useSize(() => props.size);
const compact = computed(() => sizeClasses.value.variant === "compact");

const substrate = useSurface();
const level = computed(() => Math.min(substrate.value + 2, 8));
provideSurface(level);

provideSize({ size: () => props.size });

const valuePassed = computed(() => props.value !== undefined);
const internalValue = ref(props.value ?? props.defaultValue);
const currentValue = computed(() =>
  valuePassed.value ? (props.value as string) : internalValue.value
);

function handleValueChange(v: string, parsed: ParsedColor) {
  if (!valuePassed.value) internalValue.value = v;
  emit("update:value", v, parsed);
}

const parsed = computed(() => parseColor(currentValue.value));
const swatchColor = computed(() =>
  parsed.value
    ? rgbToHexStr(parsed.value.r, parsed.value.g, parsed.value.b, parsed.value.a)
    : currentValue.value
);
const valueLabel = computed(() =>
  parsed.value
    ? rgbToHexStr(parsed.value.r, parsed.value.g, parsed.value.b, 1)
        .replace(/^#/, "")
        .toUpperCase()
    : currentValue.value
);

const triggerClass = computed(() =>
  cn(
    "flex cursor-pointer items-center border border-border bg-transparent outline-none transition-colors duration-80 hover:bg-hover focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]",
    sizeClasses.value.gap,
    sizeClasses.value.control,
    compact.value ? "px-1.5" : "px-2",
    shape.value.input,
    props.triggerClassName
  )
);
</script>

<template>
  <PopoverRoot :open="open" :modal="false" @update:open="handleOpenChange">
    <PopoverTrigger as-child>
      <button type="button" :class="triggerClass" :style="{ fontVariationSettings: fontWeights.medium }">
        <span
          v-if="triggerLabel && triggerLabelPosition === 'left'"
          :class="cn('select-none px-1 text-muted-foreground', sizeClasses.text)"
        >
          {{ triggerLabel }}
        </span>
        <!-- 小色块：棋盘格衬底支持半透明色 -->
        <span
          :class="cn('relative inline-block shrink-0 overflow-hidden', shape.bg)"
          :style="{
            width: compact ? '16px' : '20px',
            height: compact ? '16px' : '20px',
            backgroundImage:
              'conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%, var(--checker-a) 0 75%, var(--checker-b) 0)',
            backgroundSize: '8px 8px',
            boxShadow: 'inset 0 0 0 1px rgba(127,127,127,0.25)',
          }"
        >
          <span class="absolute inset-0" :style="{ backgroundColor: swatchColor }" />
        </span>
        <span
          v-if="triggerShowValue"
          :class="cn('tabular-nums font-mono text-foreground inline-block text-center min-w-[6ch]', sizeClasses.text)"
        >
          {{ valueLabel }}
        </span>
        <span
          v-if="triggerLabel && triggerLabelPosition === 'right'"
          :class="cn('select-none px-1 text-muted-foreground', sizeClasses.text)"
        >
          {{ triggerLabel }}
        </span>
        <span
          v-if="triggerShowRemove"
          role="button"
          aria-label="移除颜色"
          tabindex="0"
          class="ml-1 flex cursor-pointer items-center text-muted-foreground hover:text-foreground"
          @click.stop="emit('trigger-remove')"
          @keydown.enter.stop.prevent="emit('trigger-remove')"
          @keydown.space.stop.prevent="emit('trigger-remove')"
        >
          <XIcon :size="14" :stroke-width="1.5" />
        </span>
      </button>
    </PopoverTrigger>
    <template v-if="mounted">
      <PopoverPortal force-mount>
        <PopoverContent
          as-child
          force-mount
          side="bottom"
          align="start"
          :side-offset="6"
          class="z-50 outline-none"
        >
          <motion.div
            class="outline-none"
            :initial="{ opacity: 0, y: -4, scaleY: 0.96 }"
            :animate="
              open
                ? { opacity: 1, y: 0, scaleY: 1 }
                : { opacity: 0, y: -4, scaleY: 0.96 }
            "
            :transition="open ? spring.moderate : spring.moderate.exit"
            :style="{ transformOrigin: 'top left' }"
          >
            <!-- 面板抬到底层之上 2 档；阴影固定 3 档（dropdown 惯例）。 -->
            <ColorPicker
              :value="currentValue"
              :format="props.format"
              :default-format="props.defaultFormat"
              :swatches="props.swatches"
              :hide-eyedropper="props.hideEyedropper"
              :class="surfaceClasses(level, 3)"
              @update:value="handleValueChange"
              @update:format="emit('update:format', $event)"
            />
          </motion.div>
        </PopoverContent>
      </PopoverPortal>
    </template>
  </PopoverRoot>
</template>
