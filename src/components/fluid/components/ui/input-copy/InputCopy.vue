<script setup lang="ts">
import {
  computed,
  onUnmounted,
  ref,
  useId,
  type HTMLAttributes,
} from "vue";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { useIcon } from "../../../lib/icon-context";
import { fontWeights } from "../../../lib/font-weight";
import { useShape } from "../../../lib/shape-context";
import { useSize, type SizeVariant } from "../../../lib/size-context";
import { spring } from "../../../lib/springs";
import Tooltip from "../tooltip/Tooltip.vue";

export type InputCopyVariant = "icon" | "button";
export type InputCopyAlign = "right" | "left";

export interface InputCopyProps {
  /** 要显示并复制到剪贴板的值。 */
  value?: string;
  /** 支持 v-model 绑定。 */
  modelValue?: string;
  /** 输入框上方显示的可选标签。 */
  label?: string;
  /** 复制成功后的回调。 */
  onCopy?: () => void;
  /** 是否禁用组件。 */
  disabled?: boolean;
  /** 展示变体：仅图标带 tooltip，或带文字标签的按钮。 */
  variant?: InputCopyVariant;
  /** 复制操作相对于值的位置。 */
  align?: InputCopyAlign;
  /** 钉在尺寸阶梯的某一档（默认 36px，compact 28px）。省略时跟随外围 SizeProvider。 */
  size?: SizeVariant;
  class?: HTMLAttributes["class"];
  /** 复制操作的文案。 */
  copyLabel?: string;
  /** 复制成功的文案。 */
  copiedLabel?: string;
  /** 复制失败的文案。 */
  failedLabel?: string;
  /** Tooltip 默认文案。 */
  tooltipLabel?: string;
}

const props = withDefaults(defineProps<InputCopyProps>(), {
  variant: "icon",
  align: "right",
  disabled: false,
  copyLabel: "Copy",
  copiedLabel: "Copied",
  failedLabel: "Failed",
  tooltipLabel: "Copy to clipboard",
});

const emit = defineEmits<{
  (e: "copy"): void;
  (e: "update:modelValue", value: string): void;
}>();

const CopyIcon = useIcon("copy");
const status = ref<"idle" | "copied" | "error">("idle");
const copyCount = ref(0);
const tooltipState = ref<"idle" | "copied" | "suppressed">("idle");

let timeoutId: ReturnType<typeof setTimeout> | null = null;
const tooltipVisible = ref(false);
let tooltipWasVisible = false;

const shape = useShape();
const sizeClasses = useSize(() => props.size);
const rowPy = computed(() => (sizeClasses.value.variant === "compact" ? "py-1" : "py-2"));

const resolvedValue = computed(() => props.modelValue ?? props.value ?? "");

const generatedId = useId();
const labelId = computed(() => (props.label ? `${generatedId}-label` : undefined));
const buttonId = `${generatedId}-button`;

function handlePointerDown() {
  tooltipWasVisible = tooltipVisible.value;
}

function copyViaExecCommand() {
  const textarea = document.createElement("textarea");
  textarea.value = resolvedValue.value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

async function handleCopy() {
  if (props.disabled) return;
  let ok = true;
  try {
    await navigator.clipboard.writeText(resolvedValue.value);
  } catch {
    ok = copyViaExecCommand();
  }
  status.value = ok ? "copied" : "error";
  copyCount.value += 1;
  tooltipState.value = tooltipWasVisible ? "copied" : "suppressed";
  if (ok) {
    emit("copy");
    props.onCopy?.();
  }
  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    status.value = "idle";
    tooltipState.value = "suppressed";
  }, 2000);
}

function handleTooltipOpenChange(open: boolean) {
  tooltipVisible.value = open;
}

onUnmounted(() => {
  if (timeoutId) clearTimeout(timeoutId);
});

function handleMouseEnter() {
  if (tooltipState.value === "suppressed") {
    tooltipState.value = "idle";
  }
}

function handleMouseLeave() {
  if (tooltipState.value === "copied") {
    tooltipState.value = "suppressed";
  }
}

const tooltipForceOpen = computed(() => {
  if (tooltipState.value === "copied") return true;
  if (tooltipState.value === "suppressed") return false;
  return undefined;
});

const tooltipContent = computed(() => {
  if (tooltipState.value === "idle") return props.tooltipLabel;
  if (status.value === "error") {
    return props.failedLabel === "Failed" ? "Copy failed" : props.failedLabel;
  }
  return props.copiedLabel;
});

const ariaLabel = computed(() => {
  if (status.value === "copied") return props.copiedLabel;
  if (status.value === "error") {
    return props.failedLabel === "Failed" ? "Copy failed" : props.failedLabel;
  }
  if (props.label) return props.copyLabel;
  return props.tooltipLabel;
});
</script>

<template>
  <div
    :class="cn(
      'flex flex-col gap-0.5',
      disabled && 'opacity-50 pointer-events-none',
      props.class
    )"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <span
      v-if="label"
      :id="labelId"
      :class="cn(
        'text-muted-foreground',
        sizeClasses.text,
        align === 'left' ? 'pl-1' : 'pl-0'
      )"
      :style="{ fontVariationSettings: fontWeights.normal }"
    >
      {{ label }}
    </span>

    <Tooltip
      v-if="variant === 'icon'"
      :content="tooltipContent"
      :delay-duration="500"
      :side-offset="2"
      :force-open="tooltipForceOpen"
      @open-change="handleTooltipOpenChange"
    >
      <button
        :id="buttonId"
        type="button"
        :disabled="disabled"
        :aria-label="ariaLabel"
        :aria-labelledby="label ? `${buttonId} ${labelId}` : undefined"
        :class="cn(
          'group flex items-center w-full cursor-pointer outline-none transition-all duration-80',
          'focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]',
          shape.input
        )"
        @pointerdown="handlePointerDown"
        @click="handleCopy"
      >
        <template v-if="align === 'left'">
          <!-- action icon -->
          <span
            :class="cn(
              'shrink-0 px-1.5 transition-colors duration-80 text-muted-foreground group-hover:text-foreground',
              rowPy
            )"
          >
            <AnimatePresence mode="wait" :initial="false">
              <motion.span
                v-if="status === 'error'"
                :key="`error-${copyCount}`"
                :initial="{ opacity: 0, scale: 0.6 }"
                :animate="{ opacity: 1, scale: 1 }"
                :exit="{ opacity: 0, scale: 0.8 }"
                :transition="spring.fast"
                class="flex items-center justify-center text-destructive [&_svg]:stroke-[1.5] [&_svg]:transition-[stroke-width] [&_svg]:duration-80 group-hover:[&_svg]:stroke-[2]"
              >
                <svg
                  :width="14"
                  :height="14"
                  viewBox="2 4 20 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <motion.path
                    d="M9 9L15 15M15 9L9 15"
                    :initial="{ pathLength: 0 }"
                    :animate="{
                      pathLength: 1,
                      transition: { duration: 0.08, ease: 'easeOut' },
                    }"
                  />
                </svg>
              </motion.span>
              <motion.span
                v-else-if="status === 'copied'"
                :key="`check-${copyCount}`"
                :initial="{ opacity: 0, scale: 0.6 }"
                :animate="{ opacity: 1, scale: 1 }"
                :exit="{ opacity: 0, scale: 0.8 }"
                :transition="spring.fast"
                class="flex items-center justify-center [&_svg]:stroke-[1.5] [&_svg]:transition-[stroke-width] [&_svg]:duration-80 group-hover:[&_svg]:stroke-[2]"
              >
                <svg
                  :width="14"
                  :height="14"
                  viewBox="2 4 20 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <motion.path
                    d="M6 12L10 16L18 8"
                    :initial="{ pathLength: 0 }"
                    :animate="{
                      pathLength: 1,
                      transition: { duration: 0.08, ease: 'easeOut' },
                    }"
                  />
                </svg>
              </motion.span>
              <motion.span
                v-else
                key="copy"
                :initial="{ opacity: 0, scale: 0.8 }"
                :animate="{ opacity: 1, scale: 1 }"
                :exit="{ opacity: 0, scale: 0.8 }"
                :transition="spring.fast"
                class="flex items-center justify-center"
              >
                <CopyIcon
                  :size="14"
                  :stroke-width="1.5"
                  class="transition-[stroke-width] duration-80 group-hover:stroke-[2]"
                />
              </motion.span>
            </AnimatePresence>
          </span>

          <!-- value -->
          <span
            :class="cn(
              'flex-1 min-w-0 text-left text-foreground font-mono select-none truncate pl-1',
              sizeClasses.text,
              rowPy
            )"
            :style="{ fontVariationSettings: fontWeights.normal }"
          >
            <mark class="bg-transparent text-foreground transition-colors duration-80 group-hover:bg-[#6B97FF]/20 group-hover:text-foreground">
              {{ resolvedValue }}
            </mark>
          </span>
        </template>

        <template v-else>
          <!-- value -->
          <span
            :class="cn(
              'flex-1 min-w-0 text-left text-foreground font-mono select-none truncate pl-0',
              sizeClasses.text,
              rowPy
            )"
            :style="{ fontVariationSettings: fontWeights.normal }"
          >
            <mark class="bg-transparent text-foreground transition-colors duration-80 group-hover:bg-[#6B97FF]/20 group-hover:text-foreground">
              {{ resolvedValue }}
            </mark>
          </span>

          <!-- action icon -->
          <span
            :class="cn(
              'shrink-0 px-1.5 transition-colors duration-80 text-muted-foreground group-hover:text-foreground',
              rowPy
            )"
          >
            <AnimatePresence mode="wait" :initial="false">
              <motion.span
                v-if="status === 'error'"
                :key="`error-${copyCount}`"
                :initial="{ opacity: 0, scale: 0.6 }"
                :animate="{ opacity: 1, scale: 1 }"
                :exit="{ opacity: 0, scale: 0.8 }"
                :transition="spring.fast"
                class="flex items-center justify-center text-destructive [&_svg]:stroke-[1.5] [&_svg]:transition-[stroke-width] [&_svg]:duration-80 group-hover:[&_svg]:stroke-[2]"
              >
                <svg
                  :width="14"
                  :height="14"
                  viewBox="2 4 20 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <motion.path
                    d="M9 9L15 15M15 9L9 15"
                    :initial="{ pathLength: 0 }"
                    :animate="{
                      pathLength: 1,
                      transition: { duration: 0.08, ease: 'easeOut' },
                    }"
                  />
                </svg>
              </motion.span>
              <motion.span
                v-else-if="status === 'copied'"
                :key="`check-${copyCount}`"
                :initial="{ opacity: 0, scale: 0.6 }"
                :animate="{ opacity: 1, scale: 1 }"
                :exit="{ opacity: 0, scale: 0.8 }"
                :transition="spring.fast"
                class="flex items-center justify-center [&_svg]:stroke-[1.5] [&_svg]:transition-[stroke-width] [&_svg]:duration-80 group-hover:[&_svg]:stroke-[2]"
              >
                <svg
                  :width="14"
                  :height="14"
                  viewBox="2 4 20 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <motion.path
                    d="M6 12L10 16L18 8"
                    :initial="{ pathLength: 0 }"
                    :animate="{
                      pathLength: 1,
                      transition: { duration: 0.08, ease: 'easeOut' },
                    }"
                  />
                </svg>
              </motion.span>
              <motion.span
                v-else
                key="copy"
                :initial="{ opacity: 0, scale: 0.8 }"
                :animate="{ opacity: 1, scale: 1 }"
                :exit="{ opacity: 0, scale: 0.8 }"
                :transition="spring.fast"
                class="flex items-center justify-center"
              >
                <CopyIcon
                  :size="14"
                  :stroke-width="1.5"
                  class="transition-[stroke-width] duration-80 group-hover:stroke-[2]"
                />
              </motion.span>
            </AnimatePresence>
          </span>
        </template>
      </button>
    </Tooltip>

    <button
      v-else
      :id="buttonId"
      type="button"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :aria-labelledby="label ? `${buttonId} ${labelId}` : undefined"
      :class="cn(
        'group flex items-center w-full cursor-pointer outline-none transition-all duration-80',
        'focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]',
        shape.input
      )"
      @click="handleCopy"
    >
      <template v-if="align === 'left'">
        <!-- button action -->
        <span
          :class="cn(
            'shrink-0 flex items-center gap-1.5 px-1.5 transition-colors duration-80',
            rowPy,
            sizeClasses.text,
            'text-muted-foreground group-hover:text-foreground'
          )"
          :style="{ fontVariationSettings: fontWeights.normal }"
        >
          <AnimatePresence mode="wait" :initial="false">
            <motion.span
              v-if="status === 'error'"
              :key="`error-label-${copyCount}`"
              class="flex items-center gap-1.5 text-destructive"
              :initial="{ opacity: 0, scale: 0.6 }"
              :animate="{ opacity: 1, scale: 1 }"
              :exit="{ opacity: 0, scale: 0.8 }"
              :transition="spring.fast"
            >
              <span class="flex items-center justify-center">
                <svg
                  :width="14"
                  :height="14"
                  viewBox="2 4 20 16"
                  fill="none"
                  stroke="currentColor"
                  :stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <motion.path
                    d="M9 9L15 15M15 9L9 15"
                    :initial="{ pathLength: 0 }"
                    :animate="{
                      pathLength: 1,
                      transition: { duration: 0.08, ease: 'easeOut' },
                    }"
                  />
                </svg>
              </span>
              <span class="select-none inline-grid text-left">
                <span class="col-start-1 row-start-1 invisible" aria-hidden="true">{{ copiedLabel }}</span>
                <span class="col-start-1 row-start-1">{{ failedLabel }}</span>
              </span>
            </motion.span>
            <motion.span
              v-else-if="status === 'copied'"
              :key="`check-label-${copyCount}`"
              class="flex items-center gap-1.5"
              :initial="{ opacity: 0, scale: 0.6 }"
              :animate="{ opacity: 1, scale: 1 }"
              :exit="{ opacity: 0, scale: 0.8 }"
              :transition="spring.fast"
            >
              <span class="flex items-center justify-center">
                <svg
                  :width="14"
                  :height="14"
                  viewBox="2 4 20 16"
                  fill="none"
                  stroke="currentColor"
                  :stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <motion.path
                    d="M6 12L10 16L18 8"
                    :initial="{ pathLength: 0 }"
                    :animate="{
                      pathLength: 1,
                      transition: { duration: 0.08, ease: 'easeOut' },
                    }"
                  />
                </svg>
              </span>
              <span class="select-none inline-grid text-left">
                <span class="col-start-1 row-start-1 invisible" aria-hidden="true">{{ copiedLabel }}</span>
                <span class="col-start-1 row-start-1">{{ copiedLabel }}</span>
              </span>
            </motion.span>
            <motion.span
              v-else
              key="copy-label"
              class="flex items-center gap-1.5"
              :initial="{ opacity: 0, scale: 0.8 }"
              :animate="{ opacity: 1, scale: 1 }"
              :exit="{ opacity: 0, scale: 0.8 }"
              :transition="spring.fast"
            >
              <span class="flex items-center justify-center">
                <CopyIcon
                  :size="14"
                  :stroke-width="1.5"
                  class="transition-[stroke-width] duration-80 group-hover:stroke-[2]"
                />
              </span>
              <span class="select-none inline-grid text-left">
                <span class="col-start-1 row-start-1 invisible" aria-hidden="true">{{ copiedLabel }}</span>
                <span class="col-start-1 row-start-1">{{ copyLabel }}</span>
              </span>
            </motion.span>
          </AnimatePresence>
        </span>

        <!-- value -->
        <span
          :class="cn(
            'flex-1 min-w-0 text-left text-foreground font-mono select-none truncate pl-1',
            sizeClasses.text,
            rowPy
          )"
          :style="{ fontVariationSettings: fontWeights.normal }"
        >
          <mark class="bg-transparent text-foreground transition-colors duration-80 group-hover:bg-[#6B97FF]/20 group-hover:text-foreground">
            {{ resolvedValue }}
          </mark>
        </span>
      </template>

      <template v-else>
        <!-- value -->
        <span
          :class="cn(
            'flex-1 min-w-0 text-left text-foreground font-mono select-none truncate pl-0',
            sizeClasses.text,
            rowPy
          )"
          :style="{ fontVariationSettings: fontWeights.normal }"
        >
          <mark class="bg-transparent text-foreground transition-colors duration-80 group-hover:bg-[#6B97FF]/20 group-hover:text-foreground">
            {{ resolvedValue }}
          </mark>
        </span>

        <!-- button action -->
        <span
          :class="cn(
            'shrink-0 flex items-center gap-1.5 px-1.5 transition-colors duration-80',
            rowPy,
            sizeClasses.text,
            'text-muted-foreground group-hover:text-foreground'
          )"
          :style="{ fontVariationSettings: fontWeights.normal }"
        >
          <AnimatePresence mode="wait" :initial="false">
            <motion.span
              v-if="status === 'error'"
              :key="`error-label-${copyCount}`"
              class="flex items-center gap-1.5 text-destructive"
              :initial="{ opacity: 0, scale: 0.6 }"
              :animate="{ opacity: 1, scale: 1 }"
              :exit="{ opacity: 0, scale: 0.8 }"
              :transition="spring.fast"
            >
              <span class="flex items-center justify-center">
                <svg
                  :width="14"
                  :height="14"
                  viewBox="2 4 20 16"
                  fill="none"
                  stroke="currentColor"
                  :stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <motion.path
                    d="M9 9L15 15M15 9L9 15"
                    :initial="{ pathLength: 0 }"
                    :animate="{
                      pathLength: 1,
                      transition: { duration: 0.08, ease: 'easeOut' },
                    }"
                  />
                </svg>
              </span>
              <span class="select-none inline-grid text-left">
                <span class="col-start-1 row-start-1 invisible" aria-hidden="true">{{ copiedLabel }}</span>
                <span class="col-start-1 row-start-1">{{ failedLabel }}</span>
              </span>
            </motion.span>
            <motion.span
              v-else-if="status === 'copied'"
              :key="`check-label-${copyCount}`"
              class="flex items-center gap-1.5"
              :initial="{ opacity: 0, scale: 0.6 }"
              :animate="{ opacity: 1, scale: 1 }"
              :exit="{ opacity: 0, scale: 0.8 }"
              :transition="spring.fast"
            >
              <span class="flex items-center justify-center">
                <svg
                  :width="14"
                  :height="14"
                  viewBox="2 4 20 16"
                  fill="none"
                  stroke="currentColor"
                  :stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <motion.path
                    d="M6 12L10 16L18 8"
                    :initial="{ pathLength: 0 }"
                    :animate="{
                      pathLength: 1,
                      transition: { duration: 0.08, ease: 'easeOut' },
                    }"
                  />
                </svg>
              </span>
              <span class="select-none inline-grid text-left">
                <span class="col-start-1 row-start-1 invisible" aria-hidden="true">{{ copiedLabel }}</span>
                <span class="col-start-1 row-start-1">{{ copiedLabel }}</span>
              </span>
            </motion.span>
            <motion.span
              v-else
              key="copy-label"
              class="flex items-center gap-1.5"
              :initial="{ opacity: 0, scale: 0.8 }"
              :animate="{ opacity: 1, scale: 1 }"
              :exit="{ opacity: 0, scale: 0.8 }"
              :transition="spring.fast"
            >
              <span class="flex items-center justify-center">
                <CopyIcon
                  :size="14"
                  :stroke-width="1.5"
                  class="transition-[stroke-width] duration-80 group-hover:stroke-[2]"
                />
              </span>
              <span class="select-none inline-grid text-left">
                <span class="col-start-1 row-start-1 invisible" aria-hidden="true">{{ copiedLabel }}</span>
                <span class="col-start-1 row-start-1">{{ copyLabel }}</span>
              </span>
            </motion.span>
          </AnimatePresence>
        </span>

        <!-- value -->
        <span
          :class="cn(
            'flex-1 min-w-0 text-left text-foreground font-mono select-none truncate pl-0',
            sizeClasses.text,
            rowPy
          )"
          :style="{ fontVariationSettings: fontWeights.normal }"
        >
          <mark class="bg-transparent text-foreground transition-colors duration-80 group-hover:bg-[#6B97FF]/20 group-hover:text-foreground">
            {{ resolvedValue }}
          </mark>
        </span>
      </template>
    </button>
  </div>
</template>
