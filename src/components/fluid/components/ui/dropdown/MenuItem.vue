<script setup lang="ts">
import { ref, computed, watch, type HTMLAttributes } from "vue";
import {
  DropdownMenuItem,
  DropdownMenuRadioItem,
} from "reka-ui";
import { cn } from "../../../lib/utils";
import { shapeMap } from "../../../lib/shape-context";
import { useSize } from "../../../lib/size-context";
import type { IconComponent } from "../../../lib/icon-context";
import { useDropdownMaybe } from "./dropdown-context";
import MenuRowContent from "./MenuRowContent.vue";

// MenuItem 只在 Dropdown 内使用，而后者选择了退出全局 pill 形状——
// 理由见 dropdown.tsx。
const shape = shapeMap.rounded;

const props = withDefaults(
  defineProps<{
    /** 可选前导图标。省略时行渲染为纯文本，不保留图标列。 */
    icon?: IconComponent;
    label?: string;
    index?: number;
    /** 传布尔值时是 radio 风格选项（role="menuitemradio" + aria-checked）。
     *  传 undefined 时是普通动作项（role="menuitem"，不播报选中态）。 */
    checked?: boolean;
    onSelect?: () => void;
    disabled?: boolean;
    /** 仅弹出层内（DropdownContent 内部）：激活项是否关闭菜单。
     *  在内联 Dropdown 面板中被忽略。 @default true */
    closeOnClick?: boolean;
    class?: HTMLAttributes["class"];
  }>(),
  { closeOnClick: true }
);

const emit = defineEmits<{
  (e: "select"): void;
}>();

const dropdownCtx = useDropdownMaybe();
const internalRef = ref<HTMLDivElement | null>(null);

const itemSlots = defineSlots<{
  default?: () => any;
}>();

const resolvedLabel = computed(() => {
  if (props.label) return props.label;
  const vnodes = itemSlots.default?.() ?? [];
  const first = vnodes.find((v: any) => typeof v.children === "string");
  return typeof first?.children === "string" ? first.children : "";
});

const claimedIndex = ref<number>(props.index ?? -1);
if (claimedIndex.value === -1 && dropdownCtx?.claimIndex) {
  claimedIndex.value = dropdownCtx.claimIndex();
}
const resolvedIndex = computed(() => props.index ?? claimedIndex.value);

// 向邻近悬停系统注册行元素——悬停高亮与选中背景的 rect 都来自这里。
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

const isRadio = computed(() => typeof props.checked === "boolean");
const inMenu = computed(() => dropdownCtx?.inMenu ?? false);

function setItemRef(el: any) {
  internalRef.value = (el?.$el as HTMLDivElement | null) ?? el ?? null;
}

let lastActivateTime = 0;
function handleActivate() {
  if (props.disabled) return;
  const now = performance.now();
  if (now - lastActivateTime < 80) return;
  lastActivateTime = now;
  // 只 emit 一次：Vue 的 emit("select") 本身就会调用 onSelect prop，
  // 再手动调用会让 toggle 类回调执行两次、互相抵消。
  emit("select");
}

function handleSelectEvent(e: Event) {
  // reka 关闭菜单前检查 defaultPrevented——与 Base UI 的 closeOnClick={false} 对齐。
  if (!props.closeOnClick) e.preventDefault();
  handleActivate();
}

function handleKeydown(e: KeyboardEvent) {
  if (props.disabled) return;
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    handleActivate();
  }
}

const itemClass = computed(() =>
  cn(
    // 固定高度让标签上的 text-box trim 不会收缩行。shrink-0 因为菜单 popup
    // 是 max-height flex 列——没有它，长列表会压缩行来适应而不是滚动。
    `relative z-10 flex ${sizeClasses.value.control} shrink-0 items-center ${sizeClasses.value.gap} ${shape.item} ${sizeClasses.value.itemPx} cursor-pointer outline-none`,
    props.disabled && "pointer-events-none opacity-50",
    props.class
  )
);
</script>

<template>
  <!-- 弹出层内：菜单原语拥有 role / aria-checked / tabIndex / roving 高亮 /
      typeahead 与激活（键盘激活会合成 click，所以行的 click 也会触发）。
      样式 div 携带 Fluid Functionalism 视觉与邻近悬停注册；
      MenuItem 本身不导入原语以外的任何东西。 -->
  <DropdownMenuRadioItem
    v-if="inMenu && isRadio"
    :ref="setItemRef"
    :value="String(resolvedIndex)"
    :disabled="disabled"
    :text-value="resolvedLabel"
    as-child
    @select="handleSelectEvent"
  >
    <div :data-proximity-index="resolvedIndex" :aria-label="resolvedLabel" :class="itemClass">
      <MenuRowContent :icon="icon" :label="resolvedLabel" :active="isActive" :checked="checked" />
    </div>
  </DropdownMenuRadioItem>
  <DropdownMenuItem
    v-else-if="inMenu"
    :ref="setItemRef"
    :disabled="disabled"
    :text-value="resolvedLabel"
    as-child
    @select="handleSelectEvent"
  >
    <div :data-proximity-index="resolvedIndex" :aria-label="resolvedLabel" :class="itemClass">
      <MenuRowContent :icon="icon" :label="resolvedLabel" :active="isActive" :checked="checked" />
    </div>
  </DropdownMenuItem>

  <!-- 内联面板：自渲染 ARIA menuitem div。禁用项永远不会是 roving tab stop。 -->
  <div
    v-else
    :ref="setItemRef"
    :data-proximity-index="resolvedIndex"
    :tabindex="!disabled && resolvedIndex === (dropdownCtx?.checkedIndex ?? 0) ? 0 : -1"
    :role="isRadio ? 'menuitemradio' : 'menuitem'"
    :aria-checked="isRadio ? checked : undefined"
    :aria-disabled="disabled || undefined"
    :aria-label="resolvedLabel"
    :class="itemClass"
    @click="handleActivate"
    @keydown="handleKeydown"
  >
    <MenuRowContent :icon="icon" :label="resolvedLabel" :active="isActive" :checked="checked" />
  </div>
</template>
