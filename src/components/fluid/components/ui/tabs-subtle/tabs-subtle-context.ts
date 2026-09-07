import { inject, provide, type InjectionKey, type Ref } from "vue";

export interface TabsSubtleContextValue {
  registerTab: (index: number, element: HTMLElement | null) => void;
  hoveredIndex: Ref<number | null>;
  selectedIndex: Ref<number>;
  activeLabel: boolean;
  /** 面板联动 id 前缀（TabsSubtlePanel 在组件树别处渲染时必传）。 */
  idPrefix?: string;
}

export const TabsSubtleKey: InjectionKey<TabsSubtleContextValue> =
  Symbol("fluid-tabs-subtle");

export function provideTabsSubtleContext(ctx: TabsSubtleContextValue) {
  provide(TabsSubtleKey, ctx);
}

export function useTabsSubtle(): TabsSubtleContextValue {
  const ctx = inject(TabsSubtleKey, null);
  if (!ctx) throw new Error("TabsSubtleItem must be used within a TabsSubtle");
  return ctx;
}
