import { computed, inject, provide, type ComputedRef, type InjectionKey, type MaybeRefOrGetter } from "vue";
import { toValue } from "vue";

const SurfaceKey: InjectionKey<ComputedRef<number>> = Symbol("fluid-surface");

/** 当前表面层级（1..8，已钳制）。 */
export function useSurface(): ComputedRef<number> {
  const substrate = inject(SurfaceKey, null);
  return computed(() => (substrate ? substrate.value : 1));
}

export function provideSurface(value: MaybeRefOrGetter<number>): ComputedRef<number> {
  const level = computed(() => Math.max(1, Math.min(8, toValue(value))));
  provide(SurfaceKey, level);
  return level;
}
