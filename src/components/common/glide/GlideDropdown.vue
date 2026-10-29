<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { ChevronDown } from '@/lib/remix-icons';
import GlideList from './GlideList.vue';
import { GLIDE_SIZES, type GlideOption, type GlideSize } from './types';

export interface GlideDropdownProps {
  options?: (string | GlideOption)[];
  items?: (string | GlideOption)[];
  modelValue?: string;
  placeholder?: string;
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

const props = withDefaults(defineProps<GlideDropdownProps>(), {
  options: undefined,
  items: undefined,
  modelValue: undefined,
  placeholder: '操作…',
  size: 'md',
  radius: 10,
  menuWidth: 180,
  placement: 'bottom',
  align: 'left',
  popDuration: 180,
  glideDuration: 180,
  disabled: false,
  ariaLabel: '下拉菜单',
  className: ''
});

const emit = defineEmits<{
  'select': [value: string, item: GlideOption];
  'update:open': [open: boolean];
}>();

const isOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);

const norm = (o: string | GlideOption): GlideOption => (typeof o === 'string' ? { value: o, label: o } : o);
const items = computed(() => {
  const raw = props.items ?? props.options ?? [];
  return raw.map(norm);
});

type Phase = 'closed' | 'open' | 'closing';
const phase = ref<Phase>('closed');
const side = ref<'top' | 'bottom'>(props.placement);

let closeTimer: ReturnType<typeof setTimeout> | null = null;

const S = computed(() => GLIDE_SIZES[props.size] ?? GLIDE_SIZES.md);

const updateSide = () => {
  const triggerEl = triggerRef.value;
  if (!triggerEl) return;
  const rect = triggerEl.getBoundingClientRect();
  const menuH = items.value.length * S.value.row + 16;
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  if (spaceBelow < menuH + 8 && spaceAbove > spaceBelow) {
    side.value = 'top';
  } else {
    side.value = 'bottom';
  }
};

const openMenu = () => {
  if (props.disabled) return;
  if (closeTimer) clearTimeout(closeTimer);
  updateSide();
  isOpen.value = true;
  phase.value = 'open';
  emit('update:open', true);
};

const closeMenu = (immediate = false) => {
  if (immediate) {
    isOpen.value = false;
    phase.value = 'closed';
    emit('update:open', false);
    return;
  }
  phase.value = 'closing';
  closeTimer = setTimeout(() => {
    isOpen.value = false;
    phase.value = 'closed';
    emit('update:open', false);
  }, props.popDuration);
};

const toggle = () => {
  if (isOpen.value) closeMenu();
  else openMenu();
};

const handleSelect = (val: string, opt: GlideOption) => {
  emit('select', val, opt);
  closeMenu();
};

// Click outside handling
const onDocumentClick = (e: MouseEvent) => {
  if (!isOpen.value) return;
  const target = e.target as Node;
  if (triggerRef.value?.contains(target) || menuRef.value?.contains(target)) return;
  closeMenu();
};

const onDocumentKeyDown = (e: KeyboardEvent) => {
  if (!isOpen.value) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeMenu();
    triggerRef.value?.focus();
  }
};

watch(isOpen, (open) => {
  if (open) {
    window.addEventListener('click', onDocumentClick, true);
    window.addEventListener('keydown', onDocumentKeyDown, true);
  } else {
    window.removeEventListener('click', onDocumentClick, true);
    window.removeEventListener('keydown', onDocumentKeyDown, true);
  }
});

onUnmounted(() => {
  window.removeEventListener('click', onDocumentClick, true);
  window.removeEventListener('keydown', onDocumentKeyDown, true);
  if (closeTimer) clearTimeout(closeTimer);
});
</script>

<template>
  <div class="relative inline-block" :class="className">
    <!-- Trigger slot or default button -->
    <div
      ref="triggerRef"
      class="inline-flex cursor-pointer"
      @click="toggle"
    >
      <slot name="trigger" :is-open="isOpen" :toggle="toggle">
        <button
          type="button"
          :disabled="disabled"
          class="inline-flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent/80 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          :style="{ height: `${S.row}px` }"
        >
          <span>{{ placeholder }}</span>
          <ChevronDown
            class="size-3.5 text-muted-foreground transition-transform duration-200"
            :class="isOpen && 'rotate-180'"
          />
        </button>
      </slot>
    </div>

    <!-- Dropdown Menu Popup -->
    <div
      v-if="isOpen || phase === 'closing'"
      ref="menuRef"
      role="menu"
      :aria-label="ariaLabel"
      class="absolute z-50 overflow-hidden border border-border/80 bg-popover/95 p-1 shadow-lg backdrop-blur-md select-none transition-all"
      :class="[
        align === 'right' ? 'right-0' : 'left-0',
        side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        phase === 'open' ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95',
        side === 'top' && phase !== 'open' ? 'translate-y-1' : '',
        side === 'bottom' && phase !== 'open' ? '-translate-y-1' : ''
      ]"
      :style="{
        width: typeof menuWidth === 'number' ? `${menuWidth}px` : menuWidth,
        borderRadius: `${radius}px`,
        transitionDuration: `${popDuration}ms`,
        transformOrigin: `${align === 'right' ? 'right' : 'left'} ${side === 'top' ? 'bottom' : 'top'}`
      }"
    >
      <slot name="menu" :close="() => closeMenu(true)">
        <GlideList
          :options="items"
          :model-value="modelValue"
          orientation="vertical"
          item-type="control"
          highlight-mode="hover-only"
          :size="size"
          :radius="radius - 2"
          :padding="2"
          :gap="2"
          :glide-duration="glideDuration"
          class="w-full"
          hover-class="bg-accent/80 text-accent-foreground dark:bg-muted/70 shadow-xs"
          @select="handleSelect"
        >
          <template #default="{ item, isHovered }">
            <slot name="item" :item="item" :is-hovered="isHovered">
              <div class="flex items-center gap-2.5 px-2.5 w-full">
                <component :is="item.icon" v-if="item.icon" class="size-4 shrink-0 text-muted-foreground" />
                <span class="truncate text-xs font-medium">{{ item.label }}</span>
                <span v-if="item.tag" class="ml-auto text-[10px] text-muted-foreground">{{ item.tag }}</span>
              </div>
            </slot>
          </template>
        </GlideList>
      </slot>
    </div>
  </div>
</template>
