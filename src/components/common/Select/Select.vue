<script setup lang="ts">
import { computed, onUnmounted, ref, useId, watch } from 'vue';
import { Check, ChevronDown } from '@/lib/remix-icons';
import List from '../List/List.vue';
import { GLIDE_SIZES, type GlideOption, type GlideSize } from '../types';

export interface SelectProps {
  options?: (string | GlideOption)[];
  items?: (string | GlideOption)[];
  modelValue?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  showTags?: boolean;
  size?: GlideSize;
  radius?: number;
  menuWidth?: number | string;
  placement?: 'top' | 'bottom';
  align?: 'left' | 'right';
  popDuration?: number;
  glideDuration?: number;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}
export type GlideSelectProps = SelectProps;

const props = withDefaults(defineProps<SelectProps>(), {
  options: () => ['Option 1', 'Option 2', 'Option 3'],
  items: undefined,
  modelValue: undefined,
  value: undefined,
  defaultValue: undefined,
  placeholder: '请选择…',
  showTags: true,
  size: 'md',
  radius: 10,
  menuWidth: 200,
  placement: 'bottom',
  align: 'left',
  popDuration: 180,
  glideDuration: 180,
  disabled: false,
  ariaLabel: '选择',
  className: ''
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'change': [value: string, option: GlideOption];
}>();

const id = useId();
const norm = (o: string | GlideOption): GlideOption => (typeof o === 'string' ? { value: o, label: o } : o);
const items = computed(() => {
  const raw = props.items ?? props.options ?? [];
  return raw.map(norm);
});

const inner = ref(props.defaultValue ?? '');
const currentVal = computed(() => props.modelValue ?? props.value ?? inner.value);

// 临时选中值：用于在点击时即刻驱动 GlideList 滑块移动，等待动画完成后再关闭弹窗
const activePreviewVal = ref<string | null>(null);
const effectiveDisplayVal = computed(() => activePreviewVal.value ?? currentVal.value);
const selectedIndex = computed(() => items.value.findIndex(it => it.value === effectiveDisplayVal.value));

type Phase = 'closed' | 'open' | 'closing';
const phase = ref<Phase>('closed');
const side = ref<'top' | 'bottom'>(props.placement);

const rootRef = ref<HTMLDivElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<HTMLDivElement | null>(null);
const glideListRef = ref<InstanceType<typeof List> | null>(null);
defineExpose({ el: rootRef, list: glideListRef });

let closeTimer: ReturnType<typeof setTimeout> | undefined;
let glideDelayTimer: ReturnType<typeof setTimeout> | undefined;
const S = computed(() => GLIDE_SIZES[props.size] ?? GLIDE_SIZES.md);
const popOut = computed(() => Math.round((props.popDuration * 2) / 3));

watch(
  phase,
  next => {
    if (next !== 'open') return;
    activePreviewVal.value = null;
    const el = menuRef.value;
    const root = rootRef.value;
    if (!el || !root) return;
    const r = root.getBoundingClientRect();
    const need = el.offsetHeight + 6;
    side.value =
      props.placement === 'bottom' && r.bottom + need > window.innerHeight
        ? 'top'
        : props.placement === 'top' && r.top - need < 0
          ? 'bottom'
          : props.placement;
    el.dataset.state = 'closed';
    void el.offsetHeight;
    el.dataset.state = 'open';
  },
  { flush: 'post' }
);

const open = () => {
  if (props.disabled) return;
  clearTimeout(closeTimer);
  clearTimeout(glideDelayTimer);
  phase.value = 'open';
};

const close = (mode: 'instant' | 'pop' = 'pop') => {
  clearTimeout(closeTimer);
  clearTimeout(glideDelayTimer);
  const el = menuRef.value;
  if (mode === 'instant' || !el) {
    phase.value = 'closed';
    activePreviewVal.value = null;
    return;
  }
  el.dataset.state = 'closed';
  phase.value = 'closing';
  closeTimer = setTimeout(() => {
    phase.value = 'closed';
    activePreviewVal.value = null;
  }, popOut.value + 20);
};

const handleSelect = (val: string, option: GlideOption) => {
  activePreviewVal.value = val;
  if (props.modelValue === undefined && props.value === undefined) {
    inner.value = val;
  }
  emit('update:modelValue', val);
  emit('change', val, option);

  clearTimeout(glideDelayTimer);
  glideDelayTimer = setTimeout(() => {
    close('pop');
    triggerRef.value?.focus({ preventScroll: true });
  }, 130);
};

const onTriggerClick = () => {
  if (props.disabled) return;
  if (phase.value === 'open') close('pop');
  else open();
};

const onTriggerKey = (e: KeyboardEvent) => {
  if (props.disabled) return;
  if (phase.value !== 'open') {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      open();
    }
    return;
  }
  if (e.key === 'Escape' || e.key === 'Tab') {
    if (e.key === 'Escape') e.preventDefault();
    close('instant');
  }
};

watch(phase, (next, _prev, onCleanup) => {
  if (next === 'closed') return;
  const onDown = (e: PointerEvent) => {
    if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
      close('pop');
    }
  };
  document.addEventListener('pointerdown', onDown, true);
  onCleanup(() => document.removeEventListener('pointerdown', onDown, true));
});

watch(
  () => props.disabled,
  d => {
    if (d && phase.value !== 'closed') close('instant');
  }
);

onUnmounted(() => {
  clearTimeout(closeTimer);
  clearTimeout(glideDelayTimer);
});
</script>

<template>
  <div
    ref="rootRef"
    class="group relative inline-block text-foreground"
    :class="className"
    :data-size="size"
    :data-disabled="disabled ? '' : undefined"
  >
    <!-- 解耦的触发器插槽 / 默认触发器: 高度严格对齐 Fluid (36px / 28px) -->
    <slot
      name="trigger"
      :open="phase === 'open'"
      :selected-option="selectedIndex >= 0 ? items[selectedIndex] : null"
      :toggle="onTriggerClick"
    >
      <button
        ref="triggerRef"
        type="button"
        role="combobox"
        :aria-expanded="phase === 'open'"
        :aria-controls="`${id}-menu`"
        :aria-label="ariaLabel"
        :disabled="disabled"
        class="group/trigger relative inline-flex items-center justify-between gap-2 px-3 border border-border/80 outline-none font-medium leading-none cursor-pointer select-none touch-manipulation bg-background/80 hover:bg-muted/70 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
        :style="{
          height: `${S.chip}px`,
          fontSize: `${S.font}px`,
          borderRadius: `${radius}px`
        }"
        @click="onTriggerClick"
        @keydown="onTriggerKey"
      >
        <span class="truncate">
          {{ selectedIndex >= 0 ? items[selectedIndex].label : placeholder }}
        </span>
        <ChevronDown
          class="size-3.5 transition-transform duration-200 opacity-60 group-aria-expanded/trigger:rotate-180 shrink-0"
          aria-hidden="true"
        />
      </button>
    </slot>

    <!-- 下拉弹出层 -->
    <div
      v-if="phase !== 'closed'"
      :id="`${id}-menu`"
      ref="menuRef"
      class="absolute z-50 p-1 min-w-full rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-lg backdrop-blur-md transition-all duration-150 data-[state=closed]:pointer-events-none data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100"
      :class="[
        side === 'bottom' ? 'top-[calc(100%+6px)]' : 'bottom-[calc(100%+6px)]',
        align === 'right' ? 'right-0' : 'left-0'
      ]"
      :style="{
        width: typeof menuWidth === 'number' ? `${menuWidth}px` : menuWidth,
        transformOrigin: `${side === 'bottom' ? 'top' : 'bottom'} ${align}`
      }"
      data-state="open"
    >
      <!-- 内部引用 GlideList 核心组件: 选项高度对齐 Fluid (36px / 28px) -->
      <List
        ref="glideListRef"
        :options="items"
        :model-value="effectiveDisplayVal"
        item-type="control"
        highlight-mode="both"
        :size="size"
        :padding="4"
        :gap="2"
        :radius="radius - 3"
        :glide-duration="glideDuration"
        active-class="bg-primary/10 text-primary dark:bg-primary/20 font-medium"
        hover-class="bg-accent/80 text-accent-foreground dark:bg-muted/70 shadow-xs border border-border/40"
        @select="handleSelect"
      >
        <template #default="{ item, isSelected }">
          <div class="flex items-center gap-2 px-2.5 w-full">
            <span class="flex-1 truncate font-medium text-[13px]">{{ item.label }}</span>
            <span v-if="showTags && item.tag" class="shrink-0 text-[10px] text-muted-foreground/80 px-1 py-0.5 rounded bg-muted/60">
              {{ item.tag }}
            </span>
            <Check
              v-if="isSelected"
              class="size-3.5 shrink-0 text-primary ml-1"
              aria-hidden="true"
            />
          </div>
        </template>
      </List>
    </div>
  </div>
</template>
