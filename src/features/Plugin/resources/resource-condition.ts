import { executeSandboxCode } from "@/features/Plugin/runtime/sandbox";

export type ResourceConditionFunction =
	| "include"
	| "exclude"
	| "probability"
	| "custom";
export type ResourceConditionRow = {
	id: string;
	functionName: ResourceConditionFunction;
	value: string;
};
export const resourceConditionDefinitions = [
	{ id: "include", label: "包含", placeholder: "关键词或 /正则/" },
	{ id: "exclude", label: "不包含", placeholder: "关键词或 /正则/" },
	{ id: "probability", label: "概率", placeholder: "百分比" },
	{ id: "custom", label: "自定义", placeholder: "JavaScript 条件" },
] as const;

function messageText(message: unknown) {
	if (!message || typeof message !== "object") return "";
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.flatMap((part) =>
			part &&
			typeof part === "object" &&
			typeof (part as { text?: unknown }).text === "string"
				? [(part as { text: string }).text]
				: [],
		)
		.join("\n");
}

function parseRegex(value: string) {
	if (!value.startsWith("/")) return null;
	const closingSlash = value.lastIndexOf("/");
	if (closingSlash <= 0) return null;
	try {
		return new RegExp(
			value.slice(1, closingSlash),
			value.slice(closingSlash + 1),
		);
	} catch {
		return null;
	}
}

function createResourceConditionEnvironment(
	chatValue: unknown,
	random: () => number = Math.random,
) {
	const chat = Array.isArray(chatValue) ? chatValue : [];
	const searchableText = (depth?: unknown) => {
		const numericDepth = Number(depth);
		const messages =
			Number.isFinite(numericDepth) && numericDepth > 0
				? chat.slice(-Math.floor(numericDepth))
				: chat;
		return messages.map(messageText).filter(Boolean).join("\n");
	};
	const include = (keywordOrRegex: unknown, depth?: unknown) => {
		const keyword = String(keywordOrRegex ?? "").trim();
		if (!keyword) return false;
		const text = searchableText(depth);
		const pattern = parseRegex(keyword);
		return pattern
			? pattern.test(text)
			: text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase());
	};
	return {
		include,
		exclude: (keywordOrRegex: unknown, depth?: unknown) =>
			!include(keywordOrRegex, depth),
		probability: (percentage: unknown) => {
			const value = Number(percentage);
			return (
				Number.isFinite(value) &&
				random() * 100 < Math.min(Math.max(value, 0), 100)
			);
		},
		containKeyWord: include,
		excludeKeyWord: (keywordOrRegex: unknown, depth?: unknown) =>
			!include(keywordOrRegex, depth),
	};
}

export function evaluateResourceCondition(
	source: string | undefined,
	environment: Record<string, unknown>,
) {
	if (!source?.trim()) return true;
	return Boolean(
		executeSandboxCode(source, [
			environment,
			createResourceConditionEnvironment(environment.chat),
		]),
	);
}
