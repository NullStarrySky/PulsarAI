<script setup lang="ts">
import { computed } from 'vue';
import GlideList from './GlideList.vue';
import { type GlideOption, type GlideOrientation, type GlideSize } from './types';

export interface GlideCheckboxGroupProps {
  options?: (string | GlideOption)[];
  items?: (string | GlideOption)[];
  modelValue?: (string | number)[];
  defaultValue?: (string | number)[];
  orientation?: GlideOrientation;
  size?: GlideSize;
  itemSize?: number;
  radius?: number;
  padding?: number;
  gap?: number;
  glideDuration?: number;
  disabled?: boolean;
  className?: string;
  highlightMode?: 'both' | 'selected-only' | 'hover-only' | 'none';
  hoverHighlight?: boolean;
}

const props = withDefaults(defineProps<GlideCheckboxGroupProps>(), {
  options: () => [],
  items: undefined,
  modelValue: () => [],
  defaultValue: () => [],
  orientation: 'vertical',
  size: 'md',
  itemSize: undefined,
  radius: 8,
  padding: 4,
  gap: 2,
  glideDuration: 200,
  disabled: false,
  className: '',
  highlightMode: undefined,
  hoverHighlight: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [values: (string | number)[]];
  'change': [values: (string | number)[]];
}>();

const norm = (o: string | GlideOption): GlideOption => (typeof o === 'string' ? { value: o, label: o } : o);
const items = computed(() => {
  const raw = props.items ?? props.options ?? [];
  return raw.map(norm);
});

const resolvedHighlightMode = computed(() => {
  if (props.highlightMode) return props.highlightMode;
  if (props.hoverHighlight === false) return 'selected-only';
  return 'both';
});

const checkedSet = computed(() => new Set((props.modelValue ?? []).map(String)));

const handleUpdate = (values: string | (string | number)[]) => {
  const arr = Array.isArray(values) ? values : [values];
  emit('update:modelValue', arr);
  emit('change', arr);
};
</script>

<template>
  <div
    class="inline-block rounded-xl border border-border/60 bg-card/60 p-1 text-card-foreground shadow-xs select-none backdrop-blur-xs w-full"
    :class="className"
  >
    <GlideList
      :options="items"
      :model-value="modelValue"
      :orientation="orientation"
      item-type="control"
      :highlight-mode="resolvedHighlightMode"
      :size="size"
      :item-size="itemSize"
      :radius="radius"
      :padding="padding"
      :gap="gap"
      :glide-duration="glideDuration"
      :disabled="disabled"
      class="w-full"
      active-class="bg-primary/10 text-primary dark:bg-primary/20 border border-primary/25"
      hover-class="bg-accent/80 text-accent-foreground dark:bg-muted/70 shadow-xs border border-border/40"
      @update:model-value="handleUpdate"
    >
      <template #default="{ item, isSelected, isHovered, select }">
        <slot :item="item" :is-selected="isSelected" :is-hovered="isHovered" :select="select">
          <div class="flex items-center gap-2.5 px-3 w-full">
            <!-- Checkbox indicator: 选中项只有箭头没有轮廓，伴随收缩展开过渡 -->
            <div
              class="relative grid size-4 shrink-0 place-items-center transition-all duration-150"
              :class="checkedSet.has(item.value) ? 'border-transparent bg-transparent' : 'border border-border/80 rounded-[4px] bg-background/50'"
            >
              <!-- 纯箭头无轮廓，对勾路径伸缩动画 -->
              <svg
                class="size-4 shrink-0 text-foreground transition-all duration-160 origin-center"
                :class="checkedSet.has(item.value) ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline
                  points="20 6 9 17 4 12"
                  :class="checkedSet.has(item.value) ? 'animate-check-stroke' : ''"
                />
              </svg>
            </div>

            <component :is="item.icon" v-if="item.icon" class="size-4 shrink-0 text-muted-foreground" />

            <!-- Label & Description -->
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-[13px] font-medium leading-tight">{{ item.label }}</span>
              <span v-if="item.description" class="truncate text-[11px] text-muted-foreground leading-tight mt-0.5">
                {{ item.description }}
              </span>
            </div>

            <span v-if="item.tag" class="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {{ item.tag }}
            </span>
          </div>
        </slot>
      </template>
    </GlideList>
  </div>
</template>

<style scoped>
@keyframes check-stroke {
  from {
    stroke-dashoffset: 24;
    transform: scale(0.6);
  }
  to {
    stroke-dashoffset: 0;
    transform: scale(1);
  }
}

.animate-check-stroke {
  stroke-dasharray: 24;
  animation: check-stroke 170ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
}
</style>
