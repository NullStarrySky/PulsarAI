import type { AskUserAnswer, AskUserQuestion } from "@/components/fluid";

export interface AskUserInput {
	questions: AskUserQuestion[];
}

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

export function askUser(input: AskUserInput): Promise<AskUserResult> {
	return requester ? requester(input) : Promise.resolve({ cancelled: true });
}
