export type ReasoningEffort =
	| "none"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh";
export type ThinkingLevel = "auto" | ReasoningEffort;

export const thinkingLevelOptions = [
	{ value: "auto", label: "自动" },
	{ value: "none", label: "关闭" },
	{ value: "minimal", label: "最小" },
	{ value: "low", label: "低" },
	{ value: "medium", label: "中" },
	{ value: "high", label: "高" },
	{ value: "xhigh", label: "超高" },
] as const satisfies ReadonlyArray<{ value: ThinkingLevel; label: string }>;

const reasoningEfforts = new Set<ReasoningEffort>(
	thinkingLevelOptions
		.map((option) => option.value)
		.filter((value): value is ReasoningEffort => value !== "auto"),
);

export interface ParsedModelReference {
	providerId: string;
	modelId: string;
	thinkingLevel: ThinkingLevel;
	reasoning?: ReasoningEffort;
}

export function parseModelReference(reference: string): ParsedModelReference {
	const [providerId = "", ...segments] = reference.trim().split("/");
	const possibleReasoning = segments[segments.length - 1] as
		| ReasoningEffort
		| undefined;
	const reasoning =
		possibleReasoning && reasoningEfforts.has(possibleReasoning)
			? possibleReasoning
			: undefined;
	if (reasoning) segments.pop();
	return {
		providerId,
		modelId: segments.join("/"),
		thinkingLevel: reasoning ?? "auto",
		...(reasoning ? { reasoning } : {}),
	};
}

export function createModelReference(
	providerId: string,
	modelId: string,
	thinkingLevel: ThinkingLevel = "auto",
) {
	const base = `${providerId}/${modelId}`;
	return thinkingLevel === "auto" ? base : `${base}/${thinkingLevel}`;
}

export function thinkingLevelLabel(level: ThinkingLevel) {
	return (
		thinkingLevelOptions.find((option) => option.value === level)?.label ??
		"自动"
	);
}
