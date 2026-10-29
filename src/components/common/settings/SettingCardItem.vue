<script setup lang="ts">
import type { HTMLAttributes } from 'vue';

export interface SettingCardItemProps {
  title?: string;
  description?: string;
  disabled?: boolean;
  class?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<SettingCardItemProps>(), {
  title: '',
  description: undefined,
  disabled: false,
  class: undefined
});
</script>

<template>
  <div
    class="setting-card-item relative py-3.5 px-4 transition-colors"
    :class="[
      disabled ? 'opacity-40 pointer-events-none' : '',
      props.class
    ]"
  >
    <!-- 主行：标题 + 描述在左，右侧内容插槽在右 -->
    <div class="flex items-center justify-between gap-4 min-h-7">
      <div class="min-w-0 flex-1">
        <slot name="title">
          <h4 class="text-sm font-medium text-foreground tracking-tight leading-snug">
            {{ title }}
          </h4>
        </slot>
        <slot name="description">
          <p v-if="description" class="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {{ description }}
          </p>
        </slot>
      </div>

      <!-- 右侧内容插槽 (如 Switch, Select, Button, Input) -->
      <div v-if="$slots.right || $slots.default" class="shrink-0 flex items-center gap-2">
        <slot name="right">
          <slot />
        </slot>
      </div>
    </div>

    <!-- 下方内容插槽 (如 Slider, ColorPicker, 展开式表单区域) -->
    <div v-if="$slots.content || $slots.below" class="mt-3 pt-1">
      <slot name="content">
        <slot name="below" />
      </slot>
    </div>

    <!-- 底部内容插槽 (如提示信息、说明文案、重置按钮) -->
    <div v-if="$slots.bottom || $slots.footer" class="mt-2.5 text-xs text-muted-foreground/85">
      <slot name="bottom">
        <slot name="footer" />
      </slot>
    </div>
  </div>
</template>
