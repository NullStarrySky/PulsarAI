import { z } from "zod";

const optionSchema = z.object({
	label: z.string().min(1),
	value: z.string().optional(),
});

const askUserQuestionSchema = z
	.object({
		id: z.string().min(1),
		question: z.string().min(1),
		kind: z.enum(["text", "select", "multi-select", "boolean"]).default("text"),
		options: z.array(z.union([optionSchema, z.string()])).default([]),
		placeholder: z.string().optional(),
	})
	.superRefine((question, context) => {
		if (
			(question.kind === "select" || question.kind === "multi-select") &&
			question.options.length === 0
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: `${question.kind} 问题必须提供 options。`,
				path: ["options"],
			});
		}
	});

export const askUserSchema = z.object({
	questions: z.array(askUserQuestionSchema).min(1),
});
export type AskUserInput = z.infer<typeof askUserSchema>;
export type AskUserQuestion = z.infer<typeof askUserQuestionSchema>;
export type AskUserAnswer = string | string[] | boolean;
export type AskUserResult =
	| { answers: Record<string, AskUserAnswer>; cancelled: false }
	| { cancelled: true };

let requester: ((input: AskUserInput) => Promise<AskUserResult>) | null = null;

export function registerAskUser(
	request: (input: AskUserInput) => Promise<AskUserResult>,
) {
	requester = request;
	return () => {
		if (requester === request) requester = null;
	};
}

export async function askUser(input: unknown): Promise<AskUserResult> {
	const parsed = askUserSchema.safeParse(input);
	if (!parsed.success) throw new Error("askUser 参数无效。");
	return requester ? requester(parsed.data) : { cancelled: true };
}
