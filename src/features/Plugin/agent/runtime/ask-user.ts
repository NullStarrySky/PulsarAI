import { z } from "zod";

const optionSchema = z.object({ label: z.string().min(1), value: z.string().optional() });
export const askUserSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.union([optionSchema, z.string()])).default([]),
});
export type AskUserInput = z.infer<typeof askUserSchema>;

let requester: ((input: AskUserInput) => Promise<unknown>) | null = null;

export function registerAskUser(request: (input: AskUserInput) => Promise<unknown>) {
  requester = request;
  return () => { if (requester === request) requester = null; };
}

export async function askUser(input: unknown) {
  const parsed = askUserSchema.safeParse(input);
  if (!parsed.success) throw new Error("askUser 参数无效。");
  return requester ? requester(parsed.data) : { cancelled: true };
}
