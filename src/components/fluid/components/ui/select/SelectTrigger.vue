<script setup lang="ts">
import { computed } from "vue";
import { SelectTrigger as SelectTriggerPrimitive, SelectIcon } from "reka-ui";
import { cn } from "../../../lib/utils";
import type { IconComponent } from "../../../lib/icon-context";
import { useShape } from "../../../lib/shape-context";
import { useSize, type SizeVariant } from "../../../lib/size-context";
import { useSelectContext } from "./select-context";

const props = withDefaults(
  defineProps<{
    variant?: "bordered" | "borderless";
    icon?: IconComponent;
    placeholder?: string;
    error?: string;
    /** 仅触发器的尺寸覆盖。优先在 <Select> 上传 `size`（或外围 SizeProvider），
     *  让 popup 保持匹配。 */
    size?: SizeVariant;
    class?: string;
  }>(),
  { variant: "bordered", placeholder: "Select…" }
);

const shape = useShape();
const sizeClasses = useSize(() => props.size);
const compact = computed(() => sizeClasses.value.variant === "compact");

// 选中 label 从 Select 根的注册表读取（SelectItem 挂载即注册），
// 不依赖 reka 的 ItemText portal —— 弹层卸载瞬间会闪一帧 placeholder。
const selectCtx = useSelectContext();
const selectedLabel = computed(() =>
  selectCtx ? selectCtx.labelFor(selectCtx.value.value) : null
);

const triggerClass = computed(() =>
  cn(
    "group inline-flex items-center justify-between outline-none cursor-pointer",
    "transition-all duration-80",
    "disabled:opacity-50 disabled:pointer-events-none",
    "focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]",
    props.variant === "bordered"
      ? "border border-border bg-transparent text-foreground hover:bg-hover"
      : "border border-transparent bg-transparent text-foreground hover:bg-hover",
    sizeClasses.value.control,
    sizeClasses.value.text,
    sizeClasses.value.px,
    sizeClasses.value.gap,
    compact.value ? "min-w-[128px]" : "min-w-[160px]",
    shape.value.input,
    props.error && "border-destructive/50 hover:border-destructive/50",
    props.class
  )
);
</script>

<template>
  <div class="flex flex-col gap-1">
    <SelectTriggerPrimitive
      :aria-invalid="!!error || undefined"
      :class="triggerClass"
      data-slot="select-trigger"
    >
      <template v-if="$slots.default">
        <slot />
      </template>
      <span v-else :class="cn('flex min-w-0 flex-1 items-center', sizeClasses.gap)">
        <component
          :is="icon"
          v-if="icon"
          :size="sizeClasses.icon"
          :stroke-width="1.5"
          class="shrink-0 text-muted-foreground transition-[color,stroke-width] duration-80 group-hover:text-foreground group-hover:stroke-[2]"
        />
        <!-- 选中 label 自渲染（来自 Select 根的注册表） -->
        <span
          :class="
            cn(
              'min-w-0 flex-1 truncate py-1 -my-1 text-left [text-box:trim-both_cap_alphabetic]',
              selectedLabel ? 'text-foreground' : 'text-muted-foreground'
            )
          "
        >
          {{ selectedLabel ?? placeholder }}
        </span>
      </span>

      <SelectIcon as-child>
        <svg
          :width="sizeClasses.icon"
          :height="sizeClasses.icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          :stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="shrink-0 text-muted-foreground transition-colors duration-80 group-hover:text-foreground"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </SelectIcon>
    </SelectTriggerPrimitive>
    <span v-if="error" class="pl-3 text-[12px] text-destructive">{{ error }}</span>
  </div>
</template>
