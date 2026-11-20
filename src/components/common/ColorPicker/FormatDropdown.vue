<script setup lang="ts">
import { computed } from "vue";
import { GlideSelect } from "@/components/common";
import type { ColorFormat } from "./color-math";

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

const items = computed(() => FORMATS.map(f => ({ value: f, label: FORMAT_LABELS[f] })));
</script>

<template>
  <GlideSelect
    :model-value="value"
    :items="items"
    size="sm"
    menu-width="110"
    class="w-full"
    @update:model-value="emit('change', $event as ColorFormat)"
  />
</template>
