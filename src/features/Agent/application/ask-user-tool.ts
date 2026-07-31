import { z } from "zod";

export const askUserOptionSchema = z.object({
  label: z.string().min(1).describe("Short option label shown to the user."),
  description: z.string().min(1).optional().describe("Optional one-line explanation of the option."),
  value: z.string().min(1).optional().describe("Value returned when this option is selected. Defaults to the label."),
});

export const askUserInputSchema = z.object({
  question: z.string().min(1).describe("A concise, self-contained question for the user."),
  options: z.array(askUserOptionSchema)
    .min(1)
    .max(8)
    .describe("Mutually exclusive predefined answers. A free-response choice is added by the UI."),
});

export type AskUserInput = z.infer<typeof askUserInputSchema>;
export type AskUserOption = z.infer<typeof askUserOptionSchema>;

export interface AskUserAnswer {
  answer: string;
  source: "option" | "custom";
  optionLabel?: string;
  cancelled?: false;
}

export interface AskUserCancelled {
  cancelled: true;
}

export type AskUserResult = AskUserAnswer | AskUserCancelled;

export function normalizeAskUserResult(value: unknown): AskUserResult {
  if (!value || typeof value !== "object") {
    return { cancelled: true };
  }

  const result = value as Partial<AskUserAnswer>;
  const answer = typeof result.answer === "string" ? result.answer.trim() : "";
  if (!answer || (result.source !== "option" && result.source !== "custom")) {
    return { cancelled: true };
  }

  return {
    answer,
    source: result.source,
    ...(result.source === "option" && typeof result.optionLabel === "string"
      ? { optionLabel: result.optionLabel }
      : {}),
  };
}
