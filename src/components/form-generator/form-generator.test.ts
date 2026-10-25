import { describe, expect, it } from "vitest";
import { defaultModelSchema, imageModelSchema } from "./presets";
import {
	cloneSchema,
	createDefaultController,
	createDefaultSchemaItem,
	roundStep,
} from "./types";

describe("Form Generator Types & Helpers", () => {
	it("correctly rounds floating point values according to step", () => {
		expect(roundStep(0.7000000000000001, 0.05)).toBe(0.7);
		expect(roundStep(0.7000000000000001, 0.1)).toBe(0.7);
		expect(roundStep(0.9500000000000001, 0.01)).toBe(0.95);
		expect(roundStep(0.30000000000000004, 0.1)).toBe(0.3);
		expect(roundStep(4096.000000001, 256)).toBe(4096);
		expect(roundStep(0.1 + 0.2, 0.1)).toBe(0.3);
		expect(roundStep(0.005, 0.001)).toBe(0.005);
	});

	it("creates default controllers for each supported type", () => {
		const switchCtrl = createDefaultController("switch");
		expect(switchCtrl.type).toBe("switch");
		expect(switchCtrl.default).toBe(false);
		expect(switchCtrl.value).toBe(false);

		const selectCtrl = createDefaultController("select");
		expect(selectCtrl.type).toBe("select");
		if (selectCtrl.type === "select") {
			expect(selectCtrl.options).toContain("option1");
			expect(selectCtrl.default).toBe("option1");
		}

		const sliderCtrl = createDefaultController("slider");
		expect(sliderCtrl.type).toBe("slider");
		if (sliderCtrl.type === "slider") {
			expect(sliderCtrl.min).toBe(0);
			expect(sliderCtrl.max).toBe(100);
			expect(sliderCtrl.value).toBe(0);
		}

		const textareaCtrl = createDefaultController("textarea");
		expect(textareaCtrl.type).toBe("textarea");
		if (textareaCtrl.type === "textarea") {
			expect(textareaCtrl.value).toBe("");
			expect(textareaCtrl.placeholder).toBeDefined();
		}

		const inputCtrl = createDefaultController("input");
		expect(inputCtrl.type).toBe("input");
		if (inputCtrl.type === "input") {
			expect(inputCtrl.value).toBe("");
		}
	});

	it("creates a full SchemaItem with default properties", () => {
		const item = createDefaultSchemaItem("temp", "Temperature", "slider");
		expect(item.id).toBe("temp");
		expect(item.name).toBe("Temperature");
		expect(item.type).toBe("slider");
		if (item.type === "slider") {
			expect(item.min).toBe(0);
			expect(item.max).toBe(100);
		}
	});

	it("correctly clones schema without referencing original memory", () => {
		const cloned = cloneSchema(defaultModelSchema);
		expect(cloned.length).toBe(defaultModelSchema.length);
		cloned[0].value = 999;
		expect(defaultModelSchema[0].value).not.toBe(999);
	});

	it("validates defaultModelSchema has required LLM parameters", () => {
		const ids = defaultModelSchema.map((i) => i.id);
		expect(ids).toContain("temperature");
		expect(ids).toContain("max_tokens");
		expect(ids).toContain("top_p");
		expect(ids).toContain("stream");
		expect(ids).toContain("system_prompt");

		for (const item of defaultModelSchema) {
			expect(item.id).toBeTruthy();
			expect(item.name).toBeTruthy();
			expect(item.value).toBeDefined();
			expect(item.default).toBeDefined();
		}
	});

	it("validates imageModelSchema structure", () => {
		const ids = imageModelSchema.map((i) => i.id);
		expect(ids).toContain("sampler");
		expect(ids).toContain("steps");
		expect(ids).toContain("cfg_scale");
	});
});
