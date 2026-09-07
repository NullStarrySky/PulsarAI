import { computed, inject, provide, type ComputedRef, type InjectionKey, type Ref } from "vue";

export const DialogOpenKey: InjectionKey<ComputedRef<boolean> | Ref<boolean>> =
  Symbol("fluid-dialog-open");

export function provideDialogOpen(open: ComputedRef<boolean> | Ref<boolean>) {
  provide(DialogOpenKey, open);
}

export function useDialogOpen(): ComputedRef<boolean> {
  const open = inject(DialogOpenKey, null);
  return computed(() => (open ? open.value : false));
}
