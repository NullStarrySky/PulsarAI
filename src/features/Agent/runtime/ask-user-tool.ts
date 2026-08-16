import { z } from "zod";

export const askUserOptionSchema = z.object({
  label: z.string().min(1).describe("Short option label shown to the user."),
  description: z.string().min(1).optional().describe("Optional one-line explanation of the option."),
  value: z.string().min(1).optional().describe("Value returned when this option is selected. Defaults to the label."),
});

export type AskUserOption = z.infer<typeof askUserOptionSchema>;

export const askUserQuestionItemSchema = z.object({
  q: z.string().min(1).optional(),
  question: z.string().min(1).optional(),
  type: z.enum(["radio", "check", "checkbox"]).optional().default("radio"),
  options: z.array(z.union([askUserOptionSchema, z.string()]))
    .min(1)
    .describe("Predefined answers for this question."),
}).transform((item) => {
  const qText = item.question || item.q || "";
  const normalizedOptions: AskUserOption[] = item.options.map((opt) =>
    typeof opt === "string" ? { label: opt, value: opt } : opt
  );
  return {
    question: qText,
    type: item.type === "checkbox" ? ("check" as const) : item.type,
    options: normalizedOptions,
  };
});

export type AskUserQuestionItem = z.infer<typeof askUserQuestionItemSchema>;

export const askUserInputSchema = z.union([
  z.object({
    questions: z.array(askUserQuestionItemSchema).min(1).describe("Multiple questions to present in Approval Card."),
  }),
  z.object({
    question: z.string().min(1).describe("A concise, self-contained question for the user."),
    type: z.enum(["radio", "check", "checkbox"]).optional().default("radio"),
    options: z.array(z.union([askUserOptionSchema, z.string()]))
      .min(1)
      .describe("Predefined answers."),
  }).transform((item) => {
    const normalizedOptions: AskUserOption[] = item.options.map((opt) =>
      typeof opt === "string" ? { label: opt, value: opt } : opt
    );
    return {
      questions: [
        {
          question: item.question,
          type: item.type === "checkbox" ? ("check" as const) : item.type,
          options: normalizedOptions,
        },
      ],
    };
  }),
]);

export type AskUserInput = z.infer<typeof askUserInputSchema>;

export interface SingleAskUserAnswer {
  answer: string;
  source: "option" | "custom";
  optionLabel?: string;
  cancelled?: false;
}

export interface QuestionAnswerDetail {
  questionIndex: number;
  question: string;
  selectedIndices: number[];
  selectedOptions: string[];
  customAnswer?: string;
}

export interface MultiAskUserAnswer {
  answers: QuestionAnswerDetail[];
  summary: string;
  cancelled?: false;
}

export interface AskUserCancelled {
  cancelled: true;
}

export type AskUserAnswer = SingleAskUserAnswer | MultiAskUserAnswer;
export type AskUserResult = AskUserAnswer | AskUserCancelled;

export function normalizeAskUserResult(value: unknown): AskUserResult {
  if (!value || typeof value !== "object") {
    return { cancelled: true };
  }

  const res = value as Record<string, unknown>;

  if (res.cancelled === true) {
    return { cancelled: true };
  }

  if (Array.isArray(res.answers)) {
    const answers = res.answers as QuestionAnswerDetail[];
    const summaryParts = answers.map(
      (a) =>
        `Q${a.questionIndex + 1} (${a.question}): ${[
          ...a.selectedOptions,
          ...(a.customAnswer ? [`custom: "${a.customAnswer}"`] : []),
        ].join(", ")}`
    );
    return {
      answers,
      summary: summaryParts.join("; "),
    };
  }

  const answer = typeof res.answer === "string" ? res.answer.trim() : "";
  if (!answer || (res.source !== "option" && res.source !== "custom")) {
    return { cancelled: true };
  }

  return {
    answer,
    source: res.source as "option" | "custom",
    ...(res.source === "option" && typeof res.optionLabel === "string"
      ? { optionLabel: res.optionLabel }
      : {}),
  };
}

