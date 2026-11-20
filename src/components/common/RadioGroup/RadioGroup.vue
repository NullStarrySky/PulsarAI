<script setup lang="ts">
import { computed } from 'vue';
import List from '../List/List.vue';
import { type GlideOption, type GlideOrientation, type GlideSize } from '../types';

export interface RadioGroupProps {
  options?: (string | GlideOption)[];
  items?: (string | GlideOption)[];
  modelValue?: string | number;
  defaultValue?: string | number;
  orientation?: GlideOrientation;
  size?: GlideSize;
  itemSize?: number;
  radius?: number;
  padding?: number;
  gap?: number;
  glideDuration?: number;
  disabled?: boolean;
  className?: string;
  showBullet?: boolean;
  highlightMode?: 'both' | 'selected-only' | 'hover-only' | 'none';
  hoverHighlight?: boolean;
}
export type GlideRadioGroupProps = RadioGroupProps;

const props = withDefaults(defineProps<RadioGroupProps>(), {
  options: () => [],
  items: undefined,
  modelValue: undefined,
  defaultValue: undefined,
  orientation: 'vertical',
  size: 'md',
  itemSize: undefined,
  radius: 8,
  padding: 4,
  gap: 2,
  glideDuration: 200,
  disabled: false,
  className: '',
  showBullet: true,
  highlightMode: undefined,
  hoverHighlight: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'change': [value: string, option: GlideOption];
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

const handleSelect = (val: string, opt: GlideOption) => {
  emit('update:modelValue', val);
  emit('change', val, opt);
};
</script>

<template>
  <div
    class="inline-block rounded-xl border border-border/60 bg-card/60 p-1 text-card-foreground shadow-xs select-none backdrop-blur-xs w-full"
    :class="className"
  >
    <List
      :options="items"
      :model-value="modelValue ?? defaultValue"
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
      active-class="bg-primary/10 text-primary dark:bg-primary/20 border border-primary/25 font-medium"
      hover-class="bg-accent/80 text-accent-foreground dark:bg-muted/70 shadow-xs border border-border/40"
      @select="handleSelect"
    >
      <template #default="{ item, isSelected, isHovered, select }">
        <slot :item="item" :is-selected="isSelected" :is-hovered="isHovered" :select="select">
          <div class="flex items-center gap-2.5 px-3 w-full">
            <!-- Radio bullet: 选中项只有白点没有轮廓，收缩过渡效果 -->
            <div
              v-if="showBullet"
              class="relative grid size-4 shrink-0 place-items-center rounded-full transition-all duration-150"
              :class="isSelected ? 'border-transparent bg-transparent' : 'border border-border/80 bg-background/50'"
            >
              <!-- 纯白/高亮圆点，选中展开、取消收缩 -->
              <span
                class="size-2 rounded-full bg-foreground transition-all duration-160 origin-center"
                :class="isSelected ? 'scale-100 opacity-100 animate-dot-pop' : 'scale-0 opacity-0 pointer-events-none'"
              />
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
    </List>
  </div>
</template>

<style scoped>
@keyframes dot-pop {
  0% {
    transform: scale(0.2);
    opacity: 0;
  }
  70% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.animate-dot-pop {
  animation: dot-pop 160ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
}
</style>
