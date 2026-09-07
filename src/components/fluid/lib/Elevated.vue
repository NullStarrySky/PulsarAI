<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { useSurface, provideSurface } from "./surface-context";
import { surfaceClasses } from "./surface-classes";

const props = defineProps<{
  /**
   * 相对当前底层的抬升档数。
   *
   * 组件自身的表面层级变为 `min(substrate + offset, 8)`，
   * 并通过 SurfaceProvider 重新提供给后代，进一步嵌套会自动沿阶梯上移。
   *
   * 约定俗成的 offset：
   *   2 — dropdown / popover / select 菜单
   *   4 — dialog / modal
   */
  offset: number;
  /** 覆盖阴影层级，默认取计算出的表面层级。
   *  当组件无论嵌套多深都应保持恒定阴影时传入固定值——例如 dropdown
   *  无论打开在页面上还是对话框里都读 `shadow-surface-3`，
   *  即使其背景跟随所在底层。 */
  shadowLevel?: number;
}>();

defineOptions({ name: "Elevated" });

const substrate = useSurface();
const level = computed(() => Math.min(substrate.value + props.offset, 8));
provideSurface(level);

const classes = computed(() =>
  surfaceClasses(level.value, props.shadowLevel ?? level.value)
);

const rootRef = useTemplateRef<HTMLDivElement>("rootRef");
defineExpose({ el: rootRef });
</script>

<template>
  <div ref="rootRef" :class="classes">
    <slot />
  </div>
</template>
