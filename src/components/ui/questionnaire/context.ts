import type { InjectionKey } from "vue";

export interface QuestionnaireItemContext {
  name: string;
  multiple: boolean;
  disabled: boolean;
}

export const questionnaireItemKey: InjectionKey<QuestionnaireItemContext> = Symbol("questionnaire-item");
