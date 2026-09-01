import { describe, expect, it } from "vitest";
import {
	createPluginDataDefinition,
	parsePluginDataDefinition,
} from "@/features/Plugin/editors/data/plugin-data";

describe("Plugin data definition", () => {
	it("keeps model-facing descriptions outside .data.json", () => {
		expect(createPluginDataDefinition()).not.toHaveProperty("description");
		expect(parsePluginDataDefinition({ initialValue: { score: 1 } })).toEqual(
			expect.objectContaining({ initialValue: { score: 1 } }),
		);
		expect(parsePluginDataDefinition({ initialValue: {} })).not.toHaveProperty(
			"description",
		);
	});
});
