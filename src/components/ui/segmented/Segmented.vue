<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<{
  modelValue: string;
  options: SegmentedOption[];
  variant?: "filled" | "outlined" | "borderless";
  class?: string;
}>(), {
  variant: "filled",
  class: "",
});

const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const segmentedRef = ref<HTMLElement | null>(null);
const groupRef = ref<HTMLElement | null>(null);
const indicator = ref({ width: 0, height: 0, x: 0, y: 0, ready: false });
let observer: ResizeObserver | null = null;

const variantClass = computed(() => {
  if (props.variant === "outlined") return "border bg-background p-1";
  if (props.variant === "borderless") return "bg-transparent p-0";
  return "bg-muted/70 p-1";
});

function updateIndicator() {
  void nextTick(() => {
    const group = groupRef.value;
    const selected = Array.from(group?.querySelectorAll<HTMLElement>("[data-segmented-option]") ?? [])
      .find((item) => item.dataset.segmentedOption === props.modelValue);
    if (!group || !selected) {
      indicator.value.ready = false;
      return;
    }
    indicator.value = {
      width: selected.offsetWidth,
      height: selected.offsetHeight,
      x: selected.offsetLeft,
      y: selected.offsetTop,
      ready: true,
    };
  });
}

onMounted(() => {
  observer = new ResizeObserver(updateIndicator);
  if (segmentedRef.value) observer.observe(segmentedRef.value);
  if (groupRef.value) observer.observe(groupRef.value);
  updateIndicator();
});
onUnmounted(() => observer?.disconnect());
watch(() => [props.modelValue, props.options] as const, updateIndicator, { deep: true, flush: "post" });
</script>

<template>
  <div
    ref="segmentedRef"
    role="radiogroup"
    :class="cn('inline-flex max-w-full rounded-lg text-sm', variantClass, props.class)"
  >
    <div ref="groupRef" class="relative inline-flex items-center gap-0.5">
      <span
        v-if="indicator.ready"
        aria-hidden="true"
        class="pointer-events-none absolute top-0 left-0 z-0 rounded-md bg-background shadow-sm transition-[width,height,transform] duration-200 ease-out motion-reduce:transition-none"
        :style="{
          width: `${indicator.width}px`,
          height: `${indicator.height}px`,
          transform: `translate(${indicator.x}px, ${indicator.y}px)`,
        }"
      />
      <Button
        v-for="option in options"
        :key="option.value"
        :data-segmented-option="option.value"
        type="button"
        variant="ghost"
        size="icon-sm"
        role="radio"
        :aria-checked="modelValue === option.value"
        :aria-label="option.label"
        :title="option.label"
        :disabled="option.disabled"
        :class="cn(
          'relative z-10 min-h-7 min-w-0 rounded-md px-3 text-xs font-medium transition-colors',
          modelValue === option.value
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )"
        @click="emit('update:modelValue', option.value)"
      >
        <slot name="option" :option="option">{{ option.label }}</slot>
      </Button>
    </div>
  </div>
</template>
