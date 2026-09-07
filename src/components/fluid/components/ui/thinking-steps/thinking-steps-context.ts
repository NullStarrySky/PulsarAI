import { inject, provide, type InjectionKey, type Ref } from "vue";

/** ThinkingStep 的状态。 */
export type StepStatus = "complete" | "active" | "pending";

/** 最近的 ThinkingSteps 根的打开状态——header 触发器与面板读取。 */
export interface ThinkingStepsOpenContextValue {
  isOpen: Ref<boolean>;
}

const ThinkingStepsOpenKey: InjectionKey<ThinkingStepsOpenContextValue> =
  Symbol("fluid-thinking-steps-open");

export function provideThinkingStepsOpen(ctx: ThinkingStepsOpenContextValue) {
  provide(ThinkingStepsOpenKey, ctx);
}

export function useThinkingStepsOpen(): ThinkingStepsOpenContextValue {
  const ctx = inject(ThinkingStepsOpenKey, null);
  if (!ctx) {
    throw new Error("ThinkingSteps compound components must be inside <ThinkingSteps>");
  }
  return ctx;
}
