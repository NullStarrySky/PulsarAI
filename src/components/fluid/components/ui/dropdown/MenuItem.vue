<script setup lang="ts">
import { ref, computed, watch, useSlots, type HTMLAttributes } from "vue";
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
  (e: "click", event: MouseEvent): void;
}>();

const slots = useSlots();
const dropdownCtx = useDropdownMaybe();
const internalRef = ref<HTMLDivElement | null>(null);

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

// 向流体悬停系统注册行元素
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

function handleActivate(e?: MouseEvent) {
  if (props.disabled) return;
  emit("select");
  if (e) emit("click", e);
}

function handleSelectEvent(e: Event) {
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
    `relative z-10 flex ${sizeClasses.value.control} shrink-0 items-center ${sizeClasses.value.gap} ${shape.item} ${sizeClasses.value.itemPx} cursor-pointer outline-none select-none`,
    props.disabled && "pointer-events-none opacity-50",
    props.class
  )
);
</script>

<template>
  <!-- 弹出层内：RadioItem -->
  <DropdownMenuRadioItem
    v-if="inMenu && isRadio"
    :ref="setItemRef"
    :value="String(resolvedIndex)"
    :disabled="disabled"
    :text-value="resolvedLabel"
    as-child
    @select="handleSelectEvent"
  >
    <div
      :data-proximity-index="resolvedIndex"
      :data-fluid-hover-index="resolvedIndex"
      :aria-label="resolvedLabel || undefined"
      :class="itemClass"
      @click="handleActivate"
    >
      <MenuRowContent :icon="icon" :label="label" :active="isActive" :checked="checked">
        <slot />
      </MenuRowContent>
    </div>
  </DropdownMenuRadioItem>

  <!-- 弹出层内：普通 Item -->
  <DropdownMenuItem
    v-else-if="inMenu"
    :ref="setItemRef"
    :disabled="disabled"
    :text-value="resolvedLabel"
    as-child
    @select="handleSelectEvent"
  >
    <div
      :data-proximity-index="resolvedIndex"
      :data-fluid-hover-index="resolvedIndex"
      :aria-label="resolvedLabel || undefined"
      :class="itemClass"
      @click="handleActivate"
    >
      <MenuRowContent :icon="icon" :label="label" :active="isActive" :checked="checked">
        <slot />
      </MenuRowContent>
    </div>
  </DropdownMenuItem>

  <!-- 内联面板 -->
  <div
    v-else
    :ref="setItemRef"
    :data-proximity-index="resolvedIndex"
    :data-fluid-hover-index="resolvedIndex"
    :tabindex="!disabled && resolvedIndex === (dropdownCtx?.checkedIndex ?? 0) ? 0 : -1"
    :role="isRadio ? 'menuitemradio' : 'menuitem'"
    :aria-checked="isRadio ? checked : undefined"
    :aria-disabled="disabled || undefined"
    :aria-label="resolvedLabel || undefined"
    :class="itemClass"
    @click="handleActivate"
    @keydown="handleKeydown"
  >
    <MenuRowContent :icon="icon" :label="label" :active="isActive" :checked="checked">
      <slot />
    </MenuRowContent>
  </div>
</template>
