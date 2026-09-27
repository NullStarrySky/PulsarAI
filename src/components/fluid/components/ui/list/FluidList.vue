<script setup lang="ts">
import { AnimatePresence, motion } from "motion-v";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useProximityHover } from "../../../hooks/use-proximity-hover";
import { useShape } from "../../../lib/shape-context";
import { spring } from "../../../lib/springs";
import { cn } from "../../../lib/utils";
import { provideListContext } from "./list-context";

const props = withDefaults(
	defineProps<{
		modelValue?: string | number | null;
		class?: string;
		activeClass?: string;
		hoverClass?: string;
	}>(),
	{
		modelValue: null,
		activeClass: "bg-accent text-accent-foreground font-medium shadow-xs",
		hoverClass: "bg-hover",
	},
);

const emit = defineEmits<{
	"update:modelValue": [val: string | number];
}>();

const shape = useShape();
const containerRef = ref<HTMLElement | null>(null);

const {
	activeIndex,
	itemRects,
	session,
	handlers,
	registerItem,
	measureItems,
} = useProximityHover(containerRef);

const checkedIndex = ref<number | undefined>(undefined);
const directCheckedRect = ref<{
	top: number;
	left: number;
	width: number;
	height: number;
} | null>(null);

function computeCheckedRect() {
	const container = containerRef.value;
	if (!container) return;
	const targetVal = props.modelValue != null ? String(props.modelValue) : null;
	if (!targetVal) {
		directCheckedRect.value = null;
		checkedIndex.value = undefined;
		return;
	}

	const items = Array.from(
		container.querySelectorAll("[data-proximity-index]"),
	) as HTMLElement[];
	const el = items.find(
		(item) => item.getAttribute("data-value") === targetVal,
	);
	if (!el) {
		directCheckedRect.value = null;
		checkedIndex.value = undefined;
		return;
	}

	const pIndex = Number(el.getAttribute("data-proximity-index"));
	checkedIndex.value = !Number.isNaN(pIndex) ? pIndex : undefined;

	let top = el.offsetTop;
	let left = el.offsetLeft;
	let ancestor = el.offsetParent as HTMLElement | null;
	while (ancestor && ancestor !== container && container.contains(ancestor)) {
		top += ancestor.offsetTop + ancestor.clientTop;
		left += ancestor.offsetLeft + ancestor.clientLeft;
		ancestor = ancestor.offsetParent as HTMLElement | null;
	}

	if (el.offsetWidth > 0 || el.offsetHeight > 0) {
		directCheckedRect.value = {
			top,
			left,
			width: el.offsetWidth,
			height: el.offsetHeight,
		};
	}
}

let checkedRaf = 0;
function syncChecked() {
	cancelAnimationFrame(checkedRaf);
	checkedRaf = requestAnimationFrame(() => {
		measureItems();
		computeCheckedRect();
	});
}

let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
	syncChecked();
	if (typeof ResizeObserver !== "undefined" && containerRef.value) {
		resizeObserver = new ResizeObserver(() => {
			syncChecked();
		});
		resizeObserver.observe(containerRef.value);
	}
});

onUnmounted(() => {
	cancelAnimationFrame(checkedRaf);
	resizeObserver?.disconnect();
});

watch(() => props.modelValue, computeCheckedRect, { flush: "post" });
watch(itemRects, computeCheckedRect, { flush: "post" });

const activeRect = computed(() =>
	activeIndex.value !== null
		? (itemRects.value[activeIndex.value] ?? null)
		: null,
);

const checkedRect = computed(() => {
	if (directCheckedRect.value) return directCheckedRect.value;
	return checkedIndex.value != null
		? (itemRects.value[checkedIndex.value] ?? null)
		: null;
});

let itemIndexCounter = 0;
function claimIndex(): number {
	return itemIndexCounter++;
}

function selectItem(val: string | number) {
	emit("update:modelValue", val);
}

provideListContext({
	modelValue: computed(() => props.modelValue),
	registerItem,
	claimIndex,
	selectItem,
	measureItems: syncChecked,
});

defineExpose({
	remeasure: syncChecked,
});
</script>

<template>
  <div
    ref="containerRef"
    :class="cn('relative flex flex-col gap-0.5 select-none outline-none', props.class)"
    @mouseenter="handlers.onMouseEnter"
    @mousemove="handlers.onMouseMove"
    @mouseleave="handlers.onMouseLeave"
  >
    <!-- Background highlight overlays -->
    <div class="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <!-- Checked selection background (glides smoothly across items with spring physics) -->
      <AnimatePresence>
        <motion.div
          v-if="checkedRect"
          :class="cn('absolute inset-x-0 pointer-events-none', shape.bg, props.activeClass)"
          :style="{
            left: checkedRect.left ? `${checkedRect.left}px` : undefined,
            right: checkedRect.left ? `${checkedRect.left}px` : undefined,
          }"
          :initial="false"
          :animate="{
            top: checkedRect.top,
            height: checkedRect.height,
            opacity: 1,
          }"
          :exit="{ opacity: 0, transition: spring.moderate.exit }"
          :transition="{
            top: spring.moderate,
            height: spring.moderate,
            opacity: { duration: 0.08 },
          }"
        />
      </AnimatePresence>

      <!-- Hover background (proximity hover highlight) -->
      <AnimatePresence>
        <motion.div
          v-if="activeRect && activeIndex !== checkedIndex"
          :key="session"
          :class="cn('absolute inset-x-0 pointer-events-none', shape.bg, props.hoverClass)"
          :style="{
            left: activeRect.left ? `${activeRect.left}px` : undefined,
            right: activeRect.left ? `${activeRect.left}px` : undefined,
          }"
          :initial="{
            opacity: 0,
            top: activeRect.top,
            height: activeRect.height,
          }"
          :animate="{
            opacity: 1,
            top: activeRect.top,
            height: activeRect.height,
          }"
          :exit="{ opacity: 0, transition: spring.fast.exit }"
          :transition="{
            top: spring.fast,
            height: spring.fast,
            opacity: { duration: 0.08 },
          }"
        />
      </AnimatePresence>
    </div>

    <!-- Slotted list items (rendered on z-10 above highlight backgrounds) -->
    <div class="relative z-10 flex flex-col gap-0.5">
      <slot />
    </div>
  </div>
</template>
