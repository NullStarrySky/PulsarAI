import { type ComputedRef, type InjectionKey, inject, provide } from "vue";

export interface ListContextValue {
	modelValue: ComputedRef<string | number | null | undefined>;
	registerItem: (index: number, el: HTMLElement | null) => void;
	claimIndex: () => number;
	selectItem: (val: string | number) => void;
	measureItems: () => void;
}

const listContextKey: InjectionKey<ListContextValue> =
	Symbol("FluidListContext");

export function provideListContext(value: ListContextValue) {
	provide(listContextKey, value);
}

export function useListContext(): ListContextValue | null {
	return inject(listContextKey, null);
}
