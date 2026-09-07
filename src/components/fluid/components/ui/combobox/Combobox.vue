<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue";
import {
  ComboboxRoot,
  ComboboxAnchor,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxContent,
  ComboboxViewport,
  ComboboxInput,
  ComboboxEmpty,
  ComboboxItem,
} from "reka-ui";
import { motion, AnimatePresence } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring, exitFallbackMs } from "../../../lib/springs";
import { propPassed } from "../../../lib/prop-passed";
import { useProximityHover } from "../../../hooks/use-proximity-hover";
import { shapeMap } from "../../../lib/shape-context";
import { useSize, type SizeVariant } from "../../../lib/size-context";
import { useForwardedEl } from "../../../lib/forwarded-el";
import Elevated from "../../../lib/Elevated.vue";
import type { IconComponent } from "../../../lib/icon-context";
import { useIcon } from "../../../lib/icon-context";

// Combobox 与 Dropdown 一样选择退出全局 pill 形状——弹出层表面
// 用更小的 "rounded" 圆角更干净。
const shape = shapeMap.rounded;

export interface ComboboxItemData {
  value: string;
  label: string;
  icon?: IconComponent;
}

const props = withDefaults(
  defineProps<{
    items: readonly ComboboxItemData[];
    /** 受控选中值。 */
    modelValue?: string;
    placeholder?: string;
    /** 过滤输入的占位文本。 */
    searchPlaceholder?: string;
    emptyText?: string;
    disabled?: boolean;
    /** 把触发器与弹层钉在尺寸阶梯的某一档。省略时跟随外围 SizeProvider。 */
    size?: SizeVariant;
    class?: string;
  }>(),
  {
    placeholder: "选择…",
    searchPlaceholder: "搜索…",
    emptyText: "无匹配项",
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const ChevronDown = useIcon("chevron-down");

const instance = getCurrentInstance();
const valuePassed = computed(() => propPassed(instance, "modelValue"));

const internalValue = ref<string | undefined>(undefined);
const currentValue = computed(() =>
  valuePassed.value ? props.modelValue : internalValue.value
);

const open = ref(false);
const mounted = ref(false);

// 延迟卸载的后备释放（与 Select 相同的模式）。
watch(open, (o) => {
  if (o) {
    mounted.value = true;
    return;
  }
  const id = setTimeout(() => (mounted.value = false), exitFallbackMs(spring.fast));
  return () => clearTimeout(id);
});

function handleValueChange(next: string | undefined) {
  const v = next ?? "";
  if (!valuePassed.value) internalValue.value = v;
  emit("update:modelValue", v);
}


function handleAnimationComplete() {
  if (!open.value) mounted.value = false;
}

const selectedLabel = computed(() => {
  const found = props.items.find((it) => it.value === currentValue.value);
  return found ? found.label : null;
});

// reka 的 Combobox 按 item 的 value 过滤；这里让搜索对 label 生效。
const labelByValue = new Map(props.items.map((it) => [it.value, it.label]));
const filterFunction = (value: string, searchTerm: string) => {
  const label = labelByValue.get(value) ?? value;
  return label.toLowerCase().includes(searchTerm.toLowerCase());
};

// ── 邻近悬停（弹层内）──────────────────────────────────
const elevatedRef = ref<InstanceType<typeof Elevated> | null>(null);
const containerRef = useForwardedEl(elevatedRef);
const {
  activeIndex,
  setActiveIndex,
  itemRects,
  session,
  handlers,
  measureItems,
} = useProximityHover(containerRef);

const focusedIndex = ref<number | null>(null);

// 打开时测量一轮
watch(open, (o) => {
  if (!o) return;
  measureItems();
});

// 关闭开始时重置 overlay
watch(open, (o) => {
  if (o) return;
  focusedIndex.value = null;
  setActiveIndex(null);
});

const activeRect = computed(() =>
  activeIndex.value !== null ? itemRects.value[activeIndex.value] ?? null : null
);
const focusRect = computed(() =>
  focusedIndex.value !== null ? itemRects.value[focusedIndex.value] ?? null : null
);
const checkedRect = computed(() => {
  const idx = props.items.findIndex((it) => it.value === currentValue.value);
  return idx >= 0 ? itemRects.value[idx] ?? null : null;
});

function handleMouseEnter() {
  handlers.onMouseEnter();
  focusedIndex.value = null;
}

function handleFocus(e: FocusEvent) {
  const target = e.target as HTMLElement;
  const indexAttr = target
    .closest("[data-proximity-index]")
    ?.getAttribute("data-proximity-index");
  if (indexAttr != null) {
    const idx = Number(indexAttr);
    setActiveIndex(idx);
    focusedIndex.value = target.matches(":focus-visible") ? idx : null;
  }
}

function handleBlur(e: FocusEvent) {
  if (containerRef.value?.contains(e.relatedTarget as Node)) return;
  focusedIndex.value = null;
  setActiveIndex(null);
}

// ── 尺寸 ──
const sizeClasses = useSize(() => props.size);
const compact = computed(() => sizeClasses.value.variant === "compact");

const triggerClass = computed(() =>
  cn(
    "group inline-flex items-center justify-between outline-none cursor-pointer",
    "transition-all duration-80",
    "disabled:opacity-50 disabled:pointer-events-none",
    "focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]",
    "border border-border bg-transparent text-foreground hover:bg-hover",
    sizeClasses.value.control,
    sizeClasses.value.text,
    sizeClasses.value.px,
    sizeClasses.value.gap,
    compact.value ? "min-w-[160px]" : "min-w-[200px]",
    shape.input,
    props.class
  )
);
</script>

<template>
  <ComboboxRoot
    :model-value="currentValue"
    :open="open"
    :disabled="disabled"
    :reset-search-term-on-select="false"
    :filter-function="filterFunction"
    @update:model-value="handleValueChange"
    @update:open="open = $event"
  >
    <ComboboxAnchor as-child>
      <ComboboxTrigger as-child>
        <button type="button" :class="triggerClass" :disabled="disabled">
          <span :class="cn('flex min-w-0 flex-1 items-center', sizeClasses.gap)">
            <span
              v-if="selectedLabel"
              class="min-w-0 flex-1 truncate py-1 -my-1 text-left [text-box:trim-both_cap_alphabetic]"
            >
              {{ selectedLabel }}
            </span>
            <span
              v-else
              class="min-w-0 flex-1 truncate py-1 -my-1 text-left [text-box:trim-both_cap_alphabetic] text-muted-foreground"
            >
              {{ placeholder }}
            </span>
          </span>
          <ChevronDown
            :size="sizeClasses.icon"
            :stroke-width="1.5"
            class="shrink-0 text-muted-foreground transition-colors duration-80 group-hover:text-foreground"
          />
        </button>
      </ComboboxTrigger>
    </ComboboxAnchor>

    <template v-if="mounted">
      <ComboboxPortal>
        <ComboboxContent
          position="popper"
          side="bottom"
          align="start"
          :side-offset="6"
          class="z-50"
          :body-lock="false"
        >
          <motion.div
            :initial="{ opacity: 0, y: -4, scaleY: 0.96 }"
            :animate="
              open ? { opacity: 1, y: 0, scaleY: 1 } : { opacity: 0, y: -4, scaleY: 0.96 }
            "
            :transition="open ? spring.fast : spring.fast.exit"
            :style="{ transformOrigin: 'top center' }"
            :on-animation-complete="handleAnimationComplete"
          >
            <Elevated
              ref="elevatedRef"
              :offset="2"
              :shadow-level="3"
              :class="
                `relative flex flex-col gap-0.5 overflow-hidden ${shape.container} p-1 select-none outline-none ` +
                `min-w-[var(--reka-combobox-trigger-width)] max-h-[min(320px,var(--reka-combobox-content-available-height,320px))] ` +
                (props.class ?? '')
              "
              @mouseenter="handleMouseEnter"
              @mousemove="handlers.onMouseMove"
              @mouseleave="handlers.onMouseLeave"
              @focus="handleFocus"
              @blur="handleBlur"
            >
              <!-- 过滤输入 -->
              <div :class="cn('shrink-0 pb-1', shape.input)">
                <ComboboxInput
                  :class="
                    cn(
                      'flex h-7 w-full items-center bg-transparent text-foreground outline-none placeholder:text-muted-foreground',
                      sizeClasses.text,
                      sizeClasses.px,
                      'rounded-lg border border-border'
                    )
                  "
                  :placeholder="searchPlaceholder"
                  auto-focus
                />
              </div>

              <ComboboxViewport
                :class="
                  cn(
                    'relative flex flex-col gap-0.5 overflow-y-auto p-0 ![scrollbar-width:thin]'
                  )
                "
              >
                <!-- 选中背景 -->
                <AnimatePresence>
                  <motion.div
                    v-if="checkedRect"
                    :class="`absolute ${shape.bg} bg-active pointer-events-none`"
                    :initial="false"
                    :animate="{
                      top: checkedRect.top,
                      left: checkedRect.left,
                      width: checkedRect.width,
                      height: checkedRect.height,
                      opacity: 1,
                    }"
                    :exit="{ opacity: 0, transition: spring.moderate.exit }"
                    :transition="{ ...spring.moderate, opacity: { duration: 0.08 } }"
                  />
                </AnimatePresence>

                <!-- 悬停背景 -->
                <AnimatePresence>
                  <motion.div
                    v-if="activeRect"
                    :key="session"
                    :class="`absolute ${shape.bg} bg-hover pointer-events-none`"
                    :initial="{
                      opacity: 0,
                      top: checkedRect?.top ?? activeRect.top,
                      left: checkedRect?.left ?? activeRect.left,
                      width: checkedRect?.width ?? activeRect.width,
                      height: checkedRect?.height ?? activeRect.height,
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

                <!-- 焦点环 -->
                <AnimatePresence>
                  <motion.div
                    v-if="focusRect"
                    :class="`absolute ${shape.focusRing} pointer-events-none z-20 border border-[color:var(--focus-ring,#6B97FF)]`"
                    :initial="false"
                    :animate="{
                      left: focusRect.left - 2,
                      top: focusRect.top - 2,
                      width: focusRect.width + 4,
                      height: focusRect.height + 4,
                    }"
                    :exit="{ opacity: 0, transition: spring.fast.exit }"
                    :transition="{ ...spring.fast, opacity: { duration: 0.08 } }"
                  />
                </AnimatePresence>

                <ComboboxEmpty class="px-2 py-4 text-center text-[12px] text-muted-foreground">
                  {{ emptyText }}
                </ComboboxEmpty>

                <ComboboxItem
                  v-for="(item, i) in items"
                  :key="item.value"
                  :value="item.value"
                  :data-proximity-index="i"
                  :data-value="item.value"
                  as-child
                >
                  <div
                    class="relative z-10 flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2 outline-none transition-colors duration-80 data-[highlighted]:bg-transparent"
                    @pointerenter="handlers.onMouseEnter"
                  >
                    <component
                      :is="item.icon"
                      v-if="item.icon"
                      :size="sizeClasses.icon"
                      :stroke-width="item.value === currentValue ? 2 : 1.5"
                      :class="
                        cn(
                          'shrink-0 transition-[color,stroke-width] duration-80',
                          item.value === currentValue
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        )
                      "
                    />
                    <span
                      :class="
                        cn(
                          'inline-grid min-w-0 flex-1',
                          sizeClasses.text,
                          item.value === currentValue
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        )
                      "
                    >
                      {{ item.label }}
                    </span>
                    <!-- 固定勾选槽位：出现/消失不改变行宽 -->
                    <span aria-hidden="true" class="h-4 w-4 shrink-0">
                      <AnimatePresence>
                        <motion.svg
                          v-if="item.value === currentValue"
                          key="check"
                          :width="sizeClasses.icon"
                          :height="sizeClasses.icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          :stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          class="text-foreground"
                          :initial="{ opacity: 1 }"
                          :animate="{ opacity: 1 }"
                          :exit="{ opacity: 1 }"
                        >
                          <motion.path
                            d="M4 12L9 17L20 6"
                            :initial="{ pathLength: 0 }"
                            :animate="{
                              pathLength: 1,
                              transition: { duration: 0.08, ease: 'easeOut' },
                            }"
                            :exit="{
                              pathLength: 0,
                              transition: { duration: 0.04, ease: 'easeIn' },
                            }"
                          />
                        </motion.svg>
                      </AnimatePresence>
                    </span>
                  </div>
                </ComboboxItem>
              </ComboboxViewport>
            </Elevated>
          </motion.div>
        </ComboboxContent>
      </ComboboxPortal>
    </template>
  </ComboboxRoot>
</template>
