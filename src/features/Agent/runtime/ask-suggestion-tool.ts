import { z } from "zod";

export const askSuggestionOptionSchema = z.object({
  key: z.string().min(1).describe("Unique identifier for this option."),
  short: z.string().min(1).describe("Short summary of the option shown in alternatives drawer."),
  body: z.string().min(1).describe("Detailed description / markdown content for this option."),
  signal: z.number().int().min(0).max(3).default(3).describe("Confidence signal strength (0-3)."),
  tone: z.string().optional().describe("Color tone CSS variable or color string."),
  label: z.string().min(1).describe("Confidence label, e.g. High confidence."),
  cta: z.string().min(1).describe("Button label, e.g. Accept."),
  ctaStyle: z.string().optional().describe("Custom button style class or theme."),
});

export type AskSuggestionOption = z.infer<typeof askSuggestionOptionSchema>;

export const askSuggestionInputSchema = z.object({
  title: z.string().min(1).describe("Title / prompt of the recommendation card."),
  options: z.array(askSuggestionOptionSchema).min(1).describe("Recommendation options list. The first item is primary by default."),
});

export type AskSuggestionInput = z.infer<typeof askSuggestionInputSchema>;

export interface AskSuggestionAnswer {
  selectedKey: string;
  selectedOption: AskSuggestionOption;
  accepted: boolean;
  cancelled?: false;
}

export interface AskSuggestionCancelled {
  cancelled: true;
}

export type AskSuggestionResult = AskSuggestionAnswer | AskSuggestionCancelled;

export function normalizeAskSuggestionResult(value: unknown): AskSuggestionResult {
  if (!value || typeof value !== "object") {
    return { cancelled: true };
  }

  const raw = value as {
    cancelled?: boolean;
    selectedKey?: string;
    selectedOption?: AskSuggestionOption;
    accepted?: boolean;
  };

  if (raw.cancelled || typeof raw.selectedKey !== "string" || !raw.selectedOption) {
    return { cancelled: true };
  }

  return {
    selectedKey: raw.selectedKey,
    selectedOption: raw.selectedOption,
    accepted: Boolean(raw.accepted),
  };
}
