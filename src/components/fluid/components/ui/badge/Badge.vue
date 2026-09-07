<script setup lang="ts">
import { computed, type HTMLAttributes } from "vue";
import { cn } from "../../../lib/utils";
import { useShape } from "../../../lib/shape-context";
import { useSizeVariant } from "../../../lib/size-context";
import { badgeColors, type BadgeColor, type BadgeSize, type BadgeSizeCanonical } from "./badge-variants";

export type BadgeVariant =
  | "solid"
  | "dot"
  | "default"
  | "secondary"
  | "destructive"
  | "outline";

const legacySizeAliases: Partial<Record<BadgeSize, BadgeSizeCanonical>> = {
  sm: "compact",
  md: "default",
  lg: "default",
};

const props = withDefaults(
  defineProps<{
    variant?: BadgeVariant;
    /** 省略时徽章跟随外围 SizeProvider。旧的 sm/md/lg 值仍可解析。 */
    size?: BadgeSize;
    color?: BadgeColor;
    class?: HTMLAttributes["class"];
  }>(),
  { variant: "solid", color: "gray" }
);

const shape = useShape();
const contextSize = useSizeVariant();

const size = computed<BadgeSizeCanonical>(() => {
  if (props.size) return legacySizeAliases[props.size] ?? (props.size as BadgeSizeCanonical);
  return contextSize.value === "compact" ? "compact" : "default";
});

const colorValue = computed(() => badgeColors[props.color]);
const isSolid = computed(() =>
  props.variant === "solid" ||
  props.variant === "default" ||
  props.variant === "secondary" ||
  props.variant === "destructive"
);
const hasDot = computed(() => props.variant === "dot");
const dotSize = computed(() => (size.value === "compact" ? 6 : 7));

const colorStyle = computed(() => {
  if (props.variant === "default") {
    return { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" };
  }
  if (props.variant === "secondary") {
    return { backgroundColor: "var(--secondary)", color: "var(--secondary-foreground)" };
  }
  if (props.variant === "destructive") {
    return { backgroundColor: "var(--destructive)", color: "var(--destructive-foreground)" };
  }
  if (!isSolid.value) return {};
  if (props.color === "gray") {
    return { backgroundColor: "var(--accent)", color: "var(--foreground)" };
  }
  return {
    color: "var(--foreground)",
    backgroundColor: `color-mix(in srgb, ${colorValue.value} 15%, var(--background))`,
  };
});

const dotColor = computed(() =>
  props.color === "gray" ? "var(--muted-foreground)" : colorValue.value
);

const rootClass = computed(() =>
  cn(
    "inline-flex items-center font-medium whitespace-nowrap",
    isSolid.value ? "" : "border border-border text-foreground",
    size.value === "compact" ? "h-5 px-2 text-[11px] gap-1" : "h-6 px-2.5 text-[12px] gap-1.5",
    shape.value.item,
    props.class
  )
);
</script>

<template>
  <span :class="rootClass" :style="{ ...colorStyle }">
    <span
      v-if="hasDot"
      class="shrink-0 rounded-full"
      :style="{ width: `${dotSize}px`, height: `${dotSize}px`, backgroundColor: dotColor }"
    />
    <!-- text-box 需要块级容器——徽章根是 flex 容器，所以标签有自己的 span。
        高度固定（h-*），trim 只是让字形重新居中。 -->
    <span class="[text-box:trim-both_cap_alphabetic]"><slot /></span>
  </span>
</template>
