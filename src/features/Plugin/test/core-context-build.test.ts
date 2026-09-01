import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { builtinSlots } from "@/features/Plugin/tree/builtin-world";
import { executeSandboxCodeAsync } from "@/features/Sandbox/sandbox";

const pluginPath = resolve(process.cwd(), "src/features/Plugin/builtIn");
const corePath = resolve(pluginPath, "core");

describe("Built-in Core context builder", () => {
	it("registers every non-panel Core pipeline resource through its slot", async () => {
		const manifestSource = await readFile(
			resolve(corePath, ".pulsar-plugin.json"),
			"utf8",
		);
		const slots = builtinSlots();
		const nodes = JSON.parse(manifestSource).nodes as Record<
			string,
			{
				insertion?: { slot: string };
			}
		>;

		expect(slots.some((slot) => slot.id === "generatePath")).toBe(true);
		expect(slots.some((slot) => slot.id === "CTX_BUILD")).toBe(true);
		expect(slots.some((slot) => slot.id === "DATA_INJECT")).toBe(true);
		expect(slots.some((slot) => slot.id === "data_prompt")).toBe(true);
		expect(slots.filter((slot) => slot.id.startsWith("depth:"))).toHaveLength(
			5,
		);
		expect(nodes["context/build.js"]?.insertion?.slot).toBe("CTX_BUILD");
		expect(nodes["context/before-regex.js"]?.insertion?.slot).toBe(
			"CTX_PROCESS_BEFORE_REGEX",
		);
		expect(nodes["context/data.data.json"]?.insertion?.slot).toBe(
			"DATA_INJECT",
		);
		expect(nodes["context/data.chat.json"]?.insertion?.slot).toBe(
			"data_prompt",
		);
	});

	it("builds context through slots, inserts depth messages, and applies regex", async () => {
		const source = await readFile(
			resolve(corePath, "context/build.js"),
			"utf8",
		);
		const resources: Record<string, unknown> = {
			before: "before",
			character: "character",
			after: "after",
			user: "user",
			document: "document",
			dataPrompt: [{ role: "system", content: "data prompt" }],
			chat: [
				{ role: "system", content: "base" },
				{ role: "user", content: "tail" },
			],
			depth: [{ role: "system", content: "depth" }],
			regex: [
				{
					find_regex: "base",
					replace_regex: "rewritten",
					range: "all",
					depth_min: 1,
					depth_max: "INF",
					applyOnRendering: false,
				},
			],
		};
		const paths: Record<string, string[]> = {
			before_char: ["before"],
			character: ["character"],
			after_char: ["after"],
			user: ["user"],
			document: ["document"],
			data_prompt: ["dataPrompt"],
			chat: ["chat"],
			"depth:1": ["depth"],
			CTX_PROCESS_BEFORE_REGEX: ["processor"],
			REGEX: ["regex"],
		};

		const result = await executeSandboxCodeAsync(source, [
			{
				slot: { paths: (id: string) => paths[id] ?? [] },
				parse: async (path: string) => resources[path],
				imports: async (
					path: string,
					environment?: { messages?: unknown[] },
				) => (path === "processor" ? environment?.messages : resources[path]),
			},
		]);

		expect(result).toEqual([
			{ role: "system", content: "before" },
			{ role: "system", content: "character" },
			{ role: "system", content: "after" },
			{ role: "system", content: "user" },
			{ role: "system", content: "document" },
			{ role: "system", content: "data prompt" },
			{ role: "system", content: "rewritten" },
			{ role: "system", content: "depth" },
			{ role: "user", content: "tail" },
		]);
	});
});
