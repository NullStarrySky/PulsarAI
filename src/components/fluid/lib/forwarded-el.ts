import { computed, type Ref } from "vue";

/**
 * 桥接「暴露 el 的组件 ref」到元素 ref，供以 HTMLElement 为目标的
 * composable（如 useProximityHover）使用。
 */
export function useForwardedEl(
  instance: Ref<{ el?: HTMLElement | null } | null | undefined>
): Ref<HTMLElement | null> {
  return computed(() => instance.value?.el ?? null) as unknown as Ref<HTMLElement | null>;
}
