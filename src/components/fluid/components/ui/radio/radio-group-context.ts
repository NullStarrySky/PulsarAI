import { inject, provide, type ComputedRef, type InjectionKey, type Ref } from "vue";

export interface RadioGroupContextValue {
  registerItem: (index: number, element: HTMLElement | null) => void;
  claimIndex?: () => number;
  activeIndex: ComputedRef<number | null> | Ref<number | null>;
  selectedIndex: ComputedRef<number | null>;
  selectedValue: ComputedRef<string | undefined>;
  emitValue: (value: string) => void;
  /** 组内当前是否有选中项。驱动 roving tabindex 回退：
   *  无选中时第一项必须保持可 tab，否则整组键盘不可达。 */
  hasSelection: ComputedRef<boolean>;
}

export const RadioGroupKey: InjectionKey<RadioGroupContextValue> =
  Symbol("fluid-radio-group");

export function provideRadioGroupContext(ctx: RadioGroupContextValue) {
  provide(RadioGroupKey, ctx);
}

export function useRadioGroupContext(): RadioGroupContextValue {
  const ctx = inject(RadioGroupKey, null);
  if (!ctx) throw new Error("useRadioGroup must be used within a RadioGroup");
  return ctx;
}
