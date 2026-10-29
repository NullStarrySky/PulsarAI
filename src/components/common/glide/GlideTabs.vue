<script setup lang="ts">
import { computed, ref, watch, useSlots } from 'vue';
import GlideList from './GlideList.vue';
import { type GlideOption, type GlideSize } from './types';

export interface GlideTabOption extends GlideOption {
  content?: any;
  [key: string]: any;
}

export interface GlideTabsProps {
  options?: (string | GlideTabOption)[];
  items?: (string | GlideTabOption)[];
  modelValue?: string | number;
  defaultValue?: string | number;
  size?: GlideSize;
  radius?: number;
  glideDuration?: number;
  disabled?: boolean;
  className?: string;
  tabBarClass?: string;
  contentClass?: string;
  equalWidth?: boolean;
}

const props = withDefaults(defineProps<GlideTabsProps>(), {
  options: () => [],
  items: undefined,
  modelValue: undefined,
  defaultValue: undefined,
  size: 'md',
  radius: 8,
  glideDuration: 200,
  disabled: false,
  className: '',
  tabBarClass: '',
  contentClass: '',
  equalWidth: true
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'change': [value: string, option: GlideTabOption, direction: 'forward' | 'backward'];
}>();

const slots = useSlots();

const norm = (o: string | GlideTabOption): GlideTabOption =>
  typeof o === 'string' ? { value: o, label: o } : o;

const items = computed(() => {
  const raw = props.items ?? props.options ?? [];
  return raw.map(norm);
});

// 当前活动值
const activeVal = ref<string>(
  String(props.modelValue ?? props.defaultValue ?? items.value[0]?.value ?? '')
);

watch(
  () => props.modelValue,
  (val) => {
    if (val !== undefined && String(val) !== activeVal.value) {
      updateActive(String(val));
    }
  }
);

// 方向追踪：'forward' (向右/递增) vs 'backward' (向左/递减)
const prevIndex = ref(-1);
const currentIndex = ref(
  items.value.findIndex((it) => String(it.value) === activeVal.value)
);
const direction = ref<'forward' | 'backward'>('forward');

const updateActive = (newVal: string) => {
  const newIdx = items.value.findIndex((it) => String(it.value) === newVal);
  if (newIdx !== -1) {
    if (currentIndex.value !== -1 && newIdx !== currentIndex.value) {
      direction.value = newIdx > currentIndex.value ? 'forward' : 'backward';
    }
    prevIndex.value = currentIndex.value;
    currentIndex.value = newIdx;
  }
  activeVal.value = newVal;
};

const activeItem = computed<GlideTabOption | null>(() => {
  if (currentIndex.value >= 0 && currentIndex.value < items.value.length) {
    return items.value[currentIndex.value] ?? null;
  }
  return null;
});

const transitionName = computed(() =>
  direction.value === 'forward' ? 'glide-tab-forward' : 'glide-tab-backward'
);

const handleSelect = (val: string, opt: any) => {
  updateActive(val);
  emit('update:modelValue', val);
  emit('change', val, opt, direction.value);
};

// 判断是否需要渲染内容区
const hasContent = computed(() => {
  if (slots.content || (activeItem.value && slots[activeItem.value.value])) {
    return true;
  }
  return items.value.some((it) => it.content !== undefined);
});
</script>

<template>
  <div class="glide-tabs-root w-full flex flex-col" :class="className">
    <!-- Tab 切换栏 -->
    <div
      class="inline-flex rounded-lg border border-border/80 bg-muted p-1 text-muted-foreground select-none shadow-inner w-full"
      :class="tabBarClass"
    >
      <GlideList
        :options="items"
        :model-value="activeVal"
        orientation="horizontal"
        item-type="tab"
        :equal-width="equalWidth"
        highlight-mode="both"
        :size="size"
        :padding="0"
        :gap="2"
        :radius="radius - 2"
        :glide-duration="glideDuration"
        :disabled="disabled"
        class="w-full"
        active-class="bg-background text-foreground font-semibold shadow-[0_1px_3px_0_rgba(0,0,0,0.18),0_1px_2px_-1px_rgba(0,0,0,0.12)] dark:bg-card dark:text-foreground dark:shadow-[0_2px_6px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.12)] border border-border/60"
        hover-class="bg-background/40 text-foreground dark:bg-muted/70"
        @select="handleSelect"
      >
        <template #default="{ item, isSelected, isHovered, select }">
          <slot
            name="tab"
            :item="item"
            :is-selected="isSelected"
            :is-hovered="isHovered"
            :select="select"
          >
            <div
              class="flex items-center justify-center gap-1.5 px-3 py-1 w-full text-center transition-colors"
              :class="
                isSelected
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              "
            >
              <component :is="item.icon" v-if="item.icon" class="size-3.5 shrink-0" />
              <span class="truncate text-xs">{{ item.label }}</span>
              <span
                v-if="item.tag"
                class="text-[9px] px-1.5 py-0.2 rounded-full bg-muted font-normal text-muted-foreground"
              >
                {{ item.tag }}
              </span>
            </div>
          </slot>
        </template>
      </GlideList>
    </div>

    <!-- 
      Tab 绑定内容展示区 (基于切换方向进行左右滑动过渡)
      forward (向右切换): 新内容从右侧引入 (translateX 20px -> 0), 旧内容向左移出 (0 -> -20px)
      backward (向左切换): 新内容从左侧引入 (translateX -20px -> 0), 旧内容向右移出 (0 -> 20px)
    -->
    <div
      v-if="hasContent"
      class="glide-tabs-content-viewport relative w-full overflow-hidden mt-3"
      :class="contentClass"
    >
      <Transition :name="transitionName">
        <div
          v-if="activeItem"
          :key="activeItem.value ?? activeVal"
          class="glide-tabs-panel w-full"
        >
          <!-- 优先匹配具体 tab 名字插槽 #[tabValue]，次选 #content 插槽，最后回退至 item.content -->
          <slot
            :name="activeItem.value"
            :item="activeItem"
            :index="currentIndex"
            :direction="direction"
          >
            <slot
              name="content"
              :item="activeItem"
              :index="currentIndex"
              :direction="direction"
            >
              <component
                :is="activeItem.content"
                v-if="typeof activeItem.content === 'object' && activeItem.content"
              />
              <div v-else-if="activeItem.content !== undefined">
                {{ activeItem.content }}
              </div>
            </slot>
          </slot>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
/* 
  向右切换 (forward):
  新内容自右侧引入，旧内容向左侧退出
*/
.glide-tab-forward-enter-active,
.glide-tab-forward-leave-active {
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease;
}
.glide-tab-forward-enter-from {
  opacity: 0;
  transform: translateX(24px);
}
.glide-tab-forward-leave-to {
  opacity: 0;
  transform: translateX(-24px);
}
.glide-tab-forward-leave-active {
  position: absolute;
  inset: 0;
  width: 100%;
}

/* 
  向左切换 (backward):
  新内容自左侧引入，旧内容向右侧退出
*/
.glide-tab-backward-enter-active,
.glide-tab-backward-leave-active {
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease;
}
.glide-tab-backward-enter-from {
  opacity: 0;
  transform: translateX(-24px);
}
.glide-tab-backward-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
.glide-tab-backward-leave-active {
  position: absolute;
  inset: 0;
  width: 100%;
}
</style>
