import { executeSandboxCode } from "@/features/Plugin/runtime/sandbox";
import type { ResourceCondition } from "../dataflow/types";

export type ResourceConditionFunction =
	| "include"
	| "exclude"
	| "probability"
	| "custom";
export const resourceConditionDefinitions = [
	{ id: "include", label: "包含", placeholder: "关键词或 /正则/" },
	{ id: "exclude", label: "不包含", placeholder: "关键词或 /正则/" },
	{ id: "probability", label: "概率", placeholder: "百分比" },
	{ id: "custom", label: "自定义", placeholder: "JavaScript 条件" },
] as const;

export function createResourceCondition(
	type: ResourceConditionFunction = "include",
): ResourceCondition {
	if (type === "probability")
		return { type, param: { percentage: 100 }, link: null };
	if (type === "custom") return { type, param: { code: "" }, link: null };
	return { type, param: { keyword: "", depth: 4 }, link: null };
}

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
	conditions: ResourceCondition[] | undefined,
	environment: Record<string, unknown>,
) {
	const helpers = createResourceConditionEnvironment(environment.chat);
	const evaluate = ({ type, param }: ResourceCondition) => {
		if (type === "include") return helpers.include(param.keyword, param.depth);
		if (type === "exclude") return helpers.exclude(param.keyword, param.depth);
		if (type === "probability") return helpers.probability(param.percentage);
		if (type === "custom")
			return Boolean(
				executeSandboxCode(String(param.code ?? ""), [environment, helpers]),
			);
		return false;
	};
	if (!conditions?.length) return true;
	let result = evaluate(conditions[0]!);
	for (let index = 0; index < conditions.length - 1; index += 1) {
		const link = conditions[index]!.link;
		const next = evaluate(conditions[index + 1]!);
		result =
			link === "or"
				? result || next
				: link === "xor"
					? result !== next
					: result && next;
	}
	return result;
}
