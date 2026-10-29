<script setup lang="ts">
import type { HTMLAttributes } from 'vue';

export interface SettingCardGroupProps {
  title?: string;
  description?: string;
  class?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<SettingCardGroupProps>(), {
  title: undefined,
  description: undefined,
  class: undefined
});
</script>

<template>
  <div class="setting-card-group space-y-2.5" :class="props.class">
    <!-- 组头部：标题与可选的描述 -->
    <div
      v-if="title || description || $slots.actions"
      class="flex items-start justify-between gap-4 px-1"
    >
      <div class="min-w-0 flex-1">
        <h3 v-if="title" class="text-sm font-semibold text-foreground/95 tracking-tight">
          {{ title }}
        </h3>
        <p v-if="description" class="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {{ description }}
        </p>
      </div>
      <div v-if="$slots.actions" class="shrink-0 flex items-center gap-1.5">
        <slot name="actions" />
      </div>
    </div>

    <!-- 卡片主体：卡片圆角背景、边框、内部项分割线 -->
    <div class="rounded-2xl border border-border/80 bg-card/90 shadow-xs divide-y divide-border/50 overflow-hidden backdrop-blur-xs">
      <!-- item 插槽 -->
      <slot />
    </div>
  </div>
</template>
