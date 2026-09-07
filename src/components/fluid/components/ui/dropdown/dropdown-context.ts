import { inject, provide, type ComputedRef, type InjectionKey, type Ref } from "vue";

export interface DropdownContextValue {
  registerItem: (index: number, element: HTMLElement | null) => void;
  claimIndex?: () => number;
  activeIndex: ComputedRef<number | null> | Ref<number | null>;
  checkedIndex?: number;
  /** 项渲染在 Menu 弹出层（DropdownContent）内时为 true，此时由原语的
   *  Item / RadioItem 拥有 role、roving 高亮、typeahead 与激活。
   *  MenuItem 据此切换渲染。 */
  inMenu?: boolean;
}

export const DropdownKey: InjectionKey<DropdownContextValue> = Symbol("fluid-dropdown");

export function provideDropdownContext(ctx: DropdownContextValue) {
  provide(DropdownKey, ctx);
}

/** 必须位于 Dropdown 内部时使用。 */
export function useDropdown(): DropdownContextValue {
  const ctx = inject(DropdownKey, null);
  if (!ctx) throw new Error("useDropdown must be used within a Dropdown");
  return ctx;
}

/** 为在 Provider 之外渲染的调用方准备的空安全读取。 */
export function useDropdownMaybe(): DropdownContextValue | null {
  return inject(DropdownKey, null);
}

export interface DropdownMenuContextValue {
  open: ComputedRef<boolean> | Ref<boolean>;
  disabled: boolean;
}

export const DropdownMenuKey: InjectionKey<DropdownMenuContextValue> =
  Symbol("fluid-dropdown-menu");

export function provideDropdownMenuContext(ctx: DropdownMenuContextValue) {
  provide(DropdownMenuKey, ctx);
}

export function useDropdownMenuContext(): DropdownMenuContextValue {
  const ctx = inject(DropdownMenuKey, null);
  if (!ctx)
    throw new Error("DropdownMenu compound components must be inside <DropdownMenu>");
  return ctx;
}
