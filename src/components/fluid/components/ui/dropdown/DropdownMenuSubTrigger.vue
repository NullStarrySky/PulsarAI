<script setup lang="ts">
import { computed, ref, watch, useSlots, type HTMLAttributes } from "vue";
import { DropdownMenuSubTrigger } from "reka-ui";
import { ChevronRight } from "lucide-vue-next";
import { cn } from "../../../lib/utils";
import { shapeMap } from "../../../lib/shape-context";
import { useSize } from "../../../lib/size-context";
import type { IconComponent } from "../../../lib/icon-context";
import { useDropdownMaybe } from "./dropdown-context";
import MenuRowContent from "./MenuRowContent.vue";

const shape = shapeMap.rounded;

const props = withDefaults(
  defineProps<{
    icon?: IconComponent;
    label?: string;
    index?: number;
    disabled?: boolean;
    class?: HTMLAttributes["class"];
  }>(),
  { disabled: false }
);

const dropdownCtx = useDropdownMaybe();
const internalRef = ref<HTMLDivElement | null>(null);
const slots = useSlots();

const resolvedLabel = computed(() => {
  if (props.label) return props.label;
  const vnodes = slots.default?.() ?? [];
  const first = vnodes.find((v: any) => typeof v.children === "string");
  return typeof first?.children === "string" ? first.children : "";
});

const claimedIndex = ref<number>(props.index ?? -1);
if (claimedIndex.value === -1 && dropdownCtx?.claimIndex) {
  claimedIndex.value = dropdownCtx.claimIndex();
}
const resolvedIndex = computed(() => props.index ?? claimedIndex.value);

const registerItem = dropdownCtx?.registerItem;
watch(
  [resolvedIndex, internalRef] as const,
  ([index, el], _prev, onCleanup) => {
    if (!registerItem || index < 0) return;
    registerItem(index, el);
    onCleanup(() => registerItem(index, null));
  },
  { immediate: true }
);

const isActive = computed(() => dropdownCtx?.activeIndex.value === resolvedIndex.value);
const sizeClasses = useSize();

function setItemRef(el: any) {
  internalRef.value = (el?.$el as HTMLDivElement | null) ?? el ?? null;
}

const itemClass = computed(() =>
  cn(
    `relative z-10 flex ${sizeClasses.value.control} shrink-0 items-center ${sizeClasses.value.gap} ${shape.item} ${sizeClasses.value.itemPx} cursor-pointer outline-none select-none`,
    "transition-[color] duration-80",
    isActive.value ? "text-foreground" : "text-muted-foreground",
    props.disabled && "pointer-events-none opacity-50",
    props.class
  )
);
</script>

<template>
  <DropdownMenuSubTrigger
    :ref="setItemRef"
    :disabled="disabled"
    :text-value="resolvedLabel"
    as-child
  >
    <div
      :data-proximity-index="resolvedIndex"
      :aria-label="resolvedLabel"
      :class="itemClass"
    >
      <MenuRowContent :icon="icon" :label="resolvedLabel" :active="isActive" />
      <ChevronRight
        :size="sizeClasses.icon"
        class="shrink-0 text-muted-foreground ml-auto -mr-0.5"
      />
    </div>
  </DropdownMenuSubTrigger>
</template>
