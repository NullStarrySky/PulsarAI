import { inject, provide, type ComputedRef, type InjectionKey, type Ref } from "vue";

export interface TabsValueOrderContextValue {
  valueOrder: Ref<string[]>;
  setValueOrder: (order: string[]) => void;
  selectedValue: ComputedRef<string | undefined>;
}

export const TabsValueOrderKey: InjectionKey<TabsValueOrderContextValue> =
  Symbol("fluid-tabs-value-order");

export function injectTabsValueOrder(): TabsValueOrderContextValue | null {
  return inject(TabsValueOrderKey, null);
}

export interface TabsListContextValue {
  registerTab: (index: number, value: string, el: HTMLElement | null) => void;
  /** TabsList 按挂载顺序为每个 TabItem 分配索引。 */
  claimIndex: () => number;
  hoveredIndex: ComputedRef<number | null> | Ref<number | null>;
  selectedValue: ComputedRef<string | undefined>;
  /** 乐观地设置 selectedIdx，让指示器在点击时立即移动。 */
  setOptimisticIdx: (index: number) => void;
}

export const TabsListKey: InjectionKey<TabsListContextValue> = Symbol("fluid-tabs-list");

export function provideTabsListContext(ctx: TabsListContextValue) {
  provide(TabsListKey, ctx);
}

export function useTabsList(): TabsListContextValue {
  const ctx = inject(TabsListKey, null);
  if (!ctx) throw new Error("TabItem must be used within a TabsList");
  return ctx;
}
