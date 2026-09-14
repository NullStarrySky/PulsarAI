import { describe, expect, it } from "vitest";
import { stTestRenderers } from "@/features/Migrations/SillyTavern/import/st-test-renderers";

describe("SillyTavern test renderers", () => {
	it("provides a file-tree plan for every supported fixture", () => {
		expect(stTestRenderers.map((renderer) => renderer.kind)).toEqual([
			"worldbook",
			"regex",
			"character",
			"preset",
			"conversation",
		]);
		for (const renderer of stTestRenderers) {
			const result = renderer.render();
			expect(result.source.text).toBeTruthy();
			expect(result.plan.files.length).toBeGreaterThan(0);
		}
	});
});
