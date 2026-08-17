import type { AskUserInput } from "@/features/Plugin/agent/runtime/ask-user-tool";

export type AskUserRequester = (input: AskUserInput) => Promise<unknown>;

const askUserRequesters: AskUserRequester[] = [];

export function registerAskUserRequester(requester: AskUserRequester) {
  askUserRequesters.push(requester);
  return () => {
    const index = askUserRequesters.lastIndexOf(requester);
    if (index >= 0) {
      askUserRequesters.splice(index, 1);
    }
  };
}

export function currentAskUserRequester() {
  return askUserRequesters[askUserRequesters.length - 1] ?? null;
}
