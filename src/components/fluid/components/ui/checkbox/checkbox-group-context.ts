import { inject, provide, type ComputedRef, type InjectionKey, type Ref } from "vue";

export interface CheckboxGroupContextValue {
  registerItem: (index: number, element: HTMLElement | null) => void;
  claimIndex?: () => number;
  activeIndex: ComputedRef<number | null> | Ref<number | null>;
}

export const CheckboxGroupKey: InjectionKey<CheckboxGroupContextValue> =
  Symbol("fluid-checkbox-group");

export function provideCheckboxGroupContext(ctx: CheckboxGroupContextValue) {
  provide(CheckboxGroupKey, ctx);
}

export function useCheckboxGroup(): CheckboxGroupContextValue {
  const ctx = inject(CheckboxGroupKey, null);
  if (!ctx) throw new Error("useCheckboxGroup must be used within a CheckboxGroup");
  return ctx;
}
