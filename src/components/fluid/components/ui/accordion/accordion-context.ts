import { computed, inject, provide, type InjectionKey, type Ref, type ComputedRef } from "vue";

export interface AccordionRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface AccordionGroupContextValue {
  registerItem: (index: number, element: HTMLElement | null) => void;
  registerFullItem: (index: number, element: HTMLElement | null) => void;
  claimIndex?: () => number;
  activeIndex: ComputedRef<number | null> | Ref<number | null>;
  grouped: true;
  remeasure: () => void;
  openValues: ComputedRef<Set<string>>;
  openItemRects: Ref<Map<number, AccordionRect>>;
}

export const AccordionGroupKey: InjectionKey<AccordionGroupContextValue> =
  Symbol("fluid-accordion-group");

export function useAccordionGroup(): AccordionGroupContextValue | null {
  return inject(AccordionGroupKey, null);
}

export function provideAccordionGroup(ctx: AccordionGroupContextValue) {
  provide(AccordionGroupKey, ctx);
}

export interface AccordionItemContextValue {
  index?: number;
  value: string;
  isOpen: ComputedRef<boolean> | Ref<boolean>;
  /** 独立模式的 item 自己携带分组的取舍。 */
  highlight: "trigger" | "item";
  triggerEl: Ref<HTMLDivElement | null>;
}

export const AccordionItemKey: InjectionKey<AccordionItemContextValue> =
  Symbol("fluid-accordion-item");

export function useAccordionItemContext(): AccordionItemContextValue {
  const ctx = inject(AccordionItemKey, null);
  if (!ctx)
    throw new Error(
      "AccordionTrigger/AccordionContent must be used within an AccordionItem"
    );
  return ctx;
}

export function provideAccordionItem(ctx: AccordionItemContextValue) {
  provide(AccordionItemKey, ctx);
}

/** 独立 Accordion 提供打开值集合的 key。 */
export const StandaloneOpenKey: InjectionKey<ComputedRef<Set<string>>> =
  Symbol("fluid-accordion-standalone-open");

export function useStandaloneOpen(): ComputedRef<Set<string>> {
  return inject(StandaloneOpenKey, null) ?? computed(() => new Set<string>());
}
