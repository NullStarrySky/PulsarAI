import { describe, expect, it } from "vitest";
import { executeCodeAct } from "../agent/runtime/code-act";
import {
	executeSandboxCodeAsync,
	resolveSandboxTextAsync,
} from "../runtime/sandbox";

describe("Sandbox", () => {
	it("evaluates async environment capabilities", async () => {
		await expect(executeSandboxCodeAsync("return 1 + 1", [])).resolves.toBe(2);
	});
	it("does not implicitly invoke imported functions in macros while CodeAct executes its submitted function", async () => {
		let calls = 0;
		const exported = () => ++calls;
		const environment = { imports: () => exported };
		await resolveSandboxTextAsync('{{ imports("./counter.js") }}', [
			environment,
		]);
		expect(calls).toBe(0);
		await expect(
			resolveSandboxTextAsync('{{ imports("./counter.js")() }}', [environment]),
		).resolves.toBe("1");
		await expect(
			executeCodeAct(
				'async function () { return imports("./counter.js")(); }',
				environment,
			),
		).resolves.toEqual({ ok: true, value: 2 });
		await expect(
			executeSandboxCodeAsync("exported", [{ exported }]),
		).resolves.toBe(exported);
		expect(calls).toBe(2);
	});
});
