import { describe, expect, it } from "vitest";
import { setParamPath } from "../utils/params";

describe("request parameter paths", () => {
	it("merges compatible prefixes and rejects collisions", () => {
		const target: Record<string, unknown> = {};
		setParamPath(target, "openai.enableWebSearch", true);
		setParamPath(target, "openai.reasoningEffort", "high");
		setParamPath(target, "openai", { textVerbosity: "low" });
		expect(target).toEqual({
			openai: {
				enableWebSearch: true,
				reasoningEffort: "high",
				textVerbosity: "low",
			},
		});
		expect(() => setParamPath(target, "openai", true)).toThrow("重复");
		expect(() =>
			setParamPath(target, "openai.enableWebSearch.foo", true),
		).toThrow("不兼容");
	});
});
