<script setup lang="ts">
import { computed, onMounted, ref, useSlots, watch, type VNode } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { useShape } from "../../../lib/shape-context";
import { useProximityHover } from "../../../hooks/use-proximity-hover";
import { flattenSlotVnodes } from "../../../lib/slot-utils";
import { provideCardGroup, type CardBorder, type CardOrientation } from "./card-context";

const props = withDefaults(
  defineProps<{
    /** 每张卡片如何排布自己的内容。
     *  "card" —— 垂直堆叠（媒体/header 在上）。"inline" —— 水平行
     *  （前导媒体，尾随 footer），像表格行。
     *  @default "card" */
    orientation?: CardOrientation;
    /** 网格列数。>1 启用跨行跨列的二维邻近判定。
     *  @default 1 */
    columns?: number;
    /** "none" —— 无边框（默认），仅以细微分隔线分隔。
     *  "outlined" —— 画边框：分组时一个共享外框，`separated` 时每卡一框。
     *  @default "none" */
    border?: CardBorder;
    /** 把组拆成带间隙的独立形状卡片（瓦片网格），而不是一个连续分块。
     *  @default false */
    separated?: boolean;
    /** 启用磁吸邻近悬停高亮。 @default true */
    proximityHover?: boolean;
    class?: string;
  }>(),
  { orientation: "card", columns: 1, border: "none", separated: false, proximityHover: true }
);

const slots = useSlots();
const containerRef = ref<HTMLDivElement | null>(null);
const shape = useShape();

// >1 列换行成网格，最近项必须二维解析；单列就是普通垂直列表。
const axis = computed(() => (props.columns > 1 ? "xy" : "y"));
const {
  activeIndex,
  itemRects,
  session,
  handlers,
  registerItem,
  measureItems,
} = useProximityHover(containerRef, { axis });

// ── 从 slot 内容派生卡片数量与选中索引 ──────────────────
function isCardVnode(v: VNode): boolean {
  const type = v.type as { __name?: string; name?: string } | string;
  return typeof type !== "string" && (type.name === "Card" || type.__name === "Card");
}

function cardVnodes(): VNode[] {
  return flattenSlotVnodes(slots.default?.()).filter(isCardVnode);
}

const count = ref(0);
const selectedIndex = ref(-1);

function rescan() {
  const vnodes = cardVnodes();
  count.value = vnodes.length;
  const idx = vnodes.findIndex((v) => (v.props as { selected?: boolean } | null)?.selected);
  selectedIndex.value = idx;
}

watch(() => slots.default, rescan, { immediate: true });

// 邻近测量在卡片注册时合并触发；这里再补一次挂载后测量。
function remeasureOnce() {
  measureItems();
}
onMounted(remeasureOnce);

// ── 索引分配（setup 顺序 = 模板顺序）─────────────────────
let nextIndex = 0;
function claimIndex(): number {
  return nextIndex++;
}
function releaseIndex(_index: number) {
  // 索引不回收——列表静态时保持稳定（动态列表请用 key 重建整组）。
}

const outlined = computed(() => props.border === "outlined");
const divided = computed(() => !props.separated);

provideCardGroup({
  registerItem,
  claimIndex,
  releaseIndex,
  activeIndex,
  selectedIndex,
  orientation: props.orientation,
  columns: props.columns,
  count,
  separated: props.separated,
  divided: divided.value,
  outlined: outlined.value,
});

const activeRect = computed(() => {
  if (!props.proximityHover || activeIndex.value === null) return null;
  return itemRects.value[activeIndex.value] ?? null;
});

const groupClass = computed(() =>
  cn(
    "relative grid",
    // 共享外框把高亮 + 分隔线裁剪到自己的圆角内；分离的瓦片各自裁剪。
    outlined.value && !props.separated && `border border-border/60 overflow-hidden ${shape.value.container}`,
    props.separated ? "gap-2" : "gap-0",
    props.class
  )
);

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${Math.max(1, props.columns)}, minmax(0, 1fr))`,
}));
</script>

<template>
  <div
    ref="containerRef"
    data-slot="card-group"
    :data-orientation="orientation"
    :class="groupClass"
    :style="gridStyle"
    @mouseenter="proximityHover ? handlers.onMouseEnter() : undefined"
    @mousemove="proximityHover ? handlers.onMouseMove($event) : undefined"
    @mouseleave="proximityHover ? handlers.onMouseLeave() : undefined"
  >
    <!-- 邻近高亮——单一磁吸层，弹簧式贴向离光标最近的卡片，
        预告点击将落在哪里。 -->
    <AnimatePresence>
      <motion.div
        v-if="activeRect"
        :key="session"
        aria-hidden="true"
        :class="cn('pointer-events-none absolute z-0 bg-hover', shape.container)"
        :initial="{
          opacity: 0,
          top: activeRect.top,
          left: activeRect.left,
          width: activeRect.width,
          height: activeRect.height,
        }"
        :animate="{
          opacity: 1,
          top: activeRect.top,
          left: activeRect.left,
          width: activeRect.width,
          height: activeRect.height,
        }"
        :exit="{ opacity: 0, transition: spring.fast.exit }"
        :transition="{ ...spring.fast, opacity: { duration: 0.08 } }"
      />
    </AnimatePresence>

    <slot />
  </div>
</template>
