<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useShape } from "../../../lib/shape-context";
import { cn } from "../../../lib/utils";
import { useListContext } from "./list-context";

const props = withDefaults(
	defineProps<{
		value: string | number;
		index?: number;
		disabled?: boolean;
		class?: string;
	}>(),
	{
		disabled: false,
	},
);

const emit = defineEmits<{
	click: [event: MouseEvent];
}>();

const listCtx = useListContext();
const shape = useShape();
const itemRef = ref<HTMLElement | null>(null);

const assignedIndex = ref(props.index ?? -1);
if (assignedIndex.value === -1 && listCtx?.claimIndex) {
	assignedIndex.value = listCtx.claimIndex();
}
const resolvedIndex = computed(() => props.index ?? assignedIndex.value);

const isSelected = computed(
	() =>
		listCtx?.modelValue.value != null &&
		String(listCtx.modelValue.value) === String(props.value),
);

watch(
	[resolvedIndex, itemRef] as const,
	([idx, el], _prev, onCleanup) => {
		if (!listCtx?.registerItem || idx < 0) return;
		listCtx.registerItem(idx, el);
		onCleanup(() => listCtx.registerItem(idx, null));
	},
	{ immediate: true },
);

function handleClick(event: MouseEvent) {
	if (props.disabled) return;
	listCtx?.selectItem(props.value);
	emit("click", event);
}
</script>

<template>
  <div
    ref="itemRef"
    :data-value="String(props.value)"
    :data-proximity-index="resolvedIndex"
    :class="
      cn(
        'relative flex items-center cursor-pointer select-none outline-none transition-[color] duration-80',
        shape.item,
        isSelected
          ? 'text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground',
        props.disabled && 'pointer-events-none opacity-50',
        props.class,
      )
    "
    @click="handleClick"
  >
    <slot :selected="isSelected" />
  </div>
</template>
