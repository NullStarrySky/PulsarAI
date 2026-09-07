<script setup lang="ts">
import { computed } from "vue";
import { cn } from "../../../lib/utils";
import { fontWeights } from "../../../lib/font-weight";
import { useSize } from "../../../lib/size-context";
import { useIcon } from "../../../lib/icon-context";
import DropdownMenu from "../dropdown/DropdownMenu.vue";
import DropdownTrigger from "../dropdown/DropdownTrigger.vue";
import DropdownContent from "../dropdown/DropdownContent.vue";
import MenuItem from "../dropdown/MenuItem.vue";
import type { ColorFormat } from "./color-math";

// ─── FormatDropdown ──────────────────────────────────────────────────────
// 数值格式切换（HEX / RGB / HSL / OKLCH）。radio 语义 + 邻近悬停 +
// 弹簧开合都由库的 Dropdown 复合组件承担。

const props = defineProps<{
  value: ColorFormat;
}>();

const emit = defineEmits<{
  (e: "change", format: ColorFormat): void;
}>();

defineOptions({ name: "FormatDropdown" });

const FORMAT_LABELS: Record<ColorFormat, string> = {
  hex: "HEX",
  rgb: "RGB",
  hsl: "HSL",
  oklch: "OKLCH",
};

const FORMATS: ColorFormat[] = ["hex", "rgb", "hsl", "oklch"];

const sizeClasses = useSize();
const ChevronDownIcon = useIcon("chevron-down");

const label = computed(() => FORMAT_LABELS[props.value]);
</script>

<template>
  <DropdownMenu>
    <DropdownTrigger>
      <button
        type="button"
        :class="
          cn(
            'flex w-full cursor-pointer items-center justify-between bg-transparent outline-none transition-colors duration-80 hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)] active:bg-active',
            sizeClasses.gap,
            sizeClasses.control,
            sizeClasses.px,
            sizeClasses.text,
            'text-muted-foreground'
          )
        "
        :style="{ fontVariationSettings: fontWeights.medium }"
      >
        <span>{{ label }}</span>
        <ChevronDownIcon
          :size="14"
          :stroke-width="1.5"
          class="text-muted-foreground transition-transform duration-150"
        />
      </button>
    </DropdownTrigger>
    <DropdownContent align="start" :side-offset="6">
      <MenuItem
        v-for="(fmt, i) in FORMATS"
        :key="fmt"
        :label="FORMAT_LABELS[fmt]"
        :index="i"
        :checked="value === fmt"
        @select="emit('change', fmt)"
      >
        {{ FORMAT_LABELS[fmt] }}
      </MenuItem>
    </DropdownContent>
  </DropdownMenu>
</template>
