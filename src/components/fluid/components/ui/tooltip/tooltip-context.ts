import { inject, provide, type InjectionKey, type Ref } from "vue";

// ── Portal 容器上下文 ────────────────────────────────────

const TooltipPortalContainerKey: InjectionKey<Ref<HTMLElement | null>> =
  Symbol("fluid-tooltip-portal-container");

export function provideTooltipPortalContainer(value: Ref<HTMLElement | null>) {
  provide(TooltipPortalContainerKey, value);
}

export function useTooltipPortalContainer(): Ref<HTMLElement | null> | null {
  return inject(TooltipPortalContainerKey, null);
}

// ── Provider 分组上下文 ──────────────────────────────────

// 追踪我们上方是否存在应用级 <TooltipProvider>。没有时每个 Tooltip 才包一层
// 本地原语 Provider——每个实例都有自己的 Provider 会破坏跨 tooltip 的
// skip-delay 分组（在相邻 tooltip 间移动会重新等待完整延迟）。
const TooltipGroupKey: InjectionKey<Ref<boolean>> = Symbol("fluid-tooltip-group");

export function provideTooltipGroup(isGrouped: Ref<boolean>) {
  provide(TooltipGroupKey, isGrouped);
}

export function useTooltipGroup(): Ref<boolean> | null {
  return inject(TooltipGroupKey, null);
}
