import { z } from "zod";

const pluginRegexRuleSchema = z.object({
	find_regex: z.string(),
	replace_regex: z.string(),
	range: z.enum(["user_input", "ai_output", "all"]),
	depth_min: z.union([z.number(), z.literal("INF")]),
	depth_max: z.union([z.number(), z.literal("INF")]),
	applyOnRendering: z.boolean(),
});

const pluginRegexRulesSchema = z.array(pluginRegexRuleSchema);
export type PluginRegexRule = z.infer<typeof pluginRegexRuleSchema>;

export function createPluginRegexRule(): PluginRegexRule {
	return {
		find_regex: "",
		replace_regex: "",
		range: "all",
		depth_min: 1,
		depth_max: "INF",
		applyOnRendering: false,
	};
}

export function parsePluginRegexRules(input: unknown): PluginRegexRule[] {
	let value = input;
	if (typeof input === "string") {
		try {
			value = JSON.parse(input);
		} catch {
			return [];
		}
	}
	const parsed = pluginRegexRulesSchema.safeParse(value);
	return parsed.success ? parsed.data : [];
}
