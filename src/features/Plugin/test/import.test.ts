import { describe, expect, it, vi } from "vitest";
import { applyPulse, readFile } from "../dataflow/pulse";
import { type PluginData, resourceType } from "../dataflow/types";
import { importJavaScript } from "../resources/types/javascript/plugin-javascript";
import { createPluginEnvironment } from "../runtime/environment";
import { type RunWorldInput, runWorld } from "../runtime/run-api";
import { importBuiltinPlugins } from "../utils/import-converter";

vi.mock("@/features/Request/ai-sdk", () => ({ generateImageToPath: vi.fn() }));
vi.mock("../agent/runtime/default-agent", () => ({
	createAgentResourceProvider: () => ({}),
}));

describe("JS module imports", () => {
	it("runs explicit generation exports and creates a fresh registry for each generation", async () => {
		const track = vi.fn();
		const tree: PluginData = {
			id: "local",
			tree: {
				"entry.js":
					'export default () => { const action = imports("./counter.js"); reply.content = String(action() + imports("./counter.js")()); };',
				"counter.js": "track(); let count = 0; export default () => ++count;",
			},
			meta: {},
		};
		const input = {
			conversationId: "chat",
			container: {} as RunWorldInput["container"],
			message: { content: "" } as RunWorldInput["message"],
			prompt: "",
			chat: [],
			filetree: tree,
			applyPulse: () => {},
			context: { track },
			entryPath: "/entry.js",
		} satisfies RunWorldInput;
		const first = await runWorld(input);
		expect(input.message.content).toBe("3");
		expect(track).toHaveBeenCalledTimes(1);
		expect(first.context.importRegistry).toBeUndefined();
		const second = await runWorld(input);
		expect(input.message.content).toBe("3");
		expect(track).toHaveBeenCalledTimes(2);
		expect(second.context.importRegistry).toBeUndefined();
	});
	it("returns defaults without invoking them, and preserves named declarations", () => {
		const called = vi.fn();
		const fn = importJavaScript(
			'/* export default fake */ export default function recurse(n) { called(); return n ? recurse(n - 1) : "ok"; }',
			{ called },
		);
		expect(called).not.toHaveBeenCalled();
		expect((fn as (n: number) => string)(1)).toBe("ok");
		expect(called).toHaveBeenCalledTimes(2);
		expect(
			importJavaScript(
				'const text = "export default fake"; export default { text };',
				{},
			),
		).toEqual({ text: "export default fake" });
		expect(
			importJavaScript("export default () => 42; const after = 1;", {}),
		).toBeTypeOf("function");
		expect(importJavaScript("export default class Thing {};", {})).toBeTypeOf(
			"function",
		);
		expect(() =>
			importJavaScript('const x = "export default fake";', {}),
		).toThrow("export default");
		expect(() =>
			importJavaScript('import x from "./x.js"; export default x;', {}),
		).toThrow("imports(path)");
	});

	it("caches canonical paths, retains source-scoped state, persists through Pulse and resets per environment", () => {
		const tree: PluginData = {
			id: "local",
			tree: {
				self: {},
				global: {
					one: {
						"state.json": '{"count":0}',
						"counter.js":
							'let instance; export default function useCounter() { return instance ??= { increment() { const state = JSON.parse(read("@/state.json")); state.count++; write("@/state.json", JSON.stringify(state)); return state.count; } }; }',
					},
					two: {
						"state.json": '{"count":100}',
						"counter.js":
							'export default () => JSON.parse(read("@/state.json"));',
					},
				},
			},
			meta: {},
		};
		const pulses: unknown[] = [];
		const create = () =>
			createPluginEnvironment({
				filetree: tree,
				sourcePath: "/self/start.js",
				applyPulse(pulse) {
					pulses.push(pulse);
					applyPulse(tree, pulse);
				},
			});
		const built = create();
		const useCounter = built.importAt(
			"/global/one/counter.js",
			"/self/start.js",
		) as () => { increment(): number };
		expect(built.importAt("./counter.js", "/global/one/start.js")).toBe(
			useCounter,
		);
		expect(built.importAt("@/counter.js", "/global/one/start.js")).toBe(
			useCounter,
		);
		expect(useCounter()).toBe(useCounter());
		expect(useCounter().increment()).toBe(1);
		expect(useCounter().increment()).toBe(2);
		expect(readFile(tree, "/global/one/state.json")).toBe('{"count":2}');
		expect(pulses).toHaveLength(2);
		const other = built.importAt(
			"@/counter.js",
			"/global/two/start.js",
		) as () => unknown;
		expect(other()).toEqual({ count: 100 });
		expect(other).not.toBe(useCounter);
		expect(built.environment.importRegistry).toBeUndefined();
		expect(built.importRegistry.has("/global/one/counter.js")).toBe(true);
		built.dispose();
		expect(built.importRegistry.size).toBe(0);
		expect(
			create().importAt("/global/one/counter.js", "/self/start.js"),
		).not.toBe(useCounter);
	});

	it("caches JSON snapshots and undefined results while read stays live; retries failed imports and diagnoses cycles", () => {
		const tree: PluginData = {
			id: "local",
			tree: {
				"state.json": '{"count":0}',
				"none.js": "export default undefined;",
				"bad.js": "const x = 1;",
				"cycle.js": 'const x = imports("./cycle.js"); export default x;',
			},
			meta: {},
		};
		const built = createPluginEnvironment({
			filetree: tree,
			sourcePath: "/start.js",
			applyPulse: (pulse) => applyPulse(tree, pulse),
		});
		const snapshot = built.importAt("./state.json", "/start.js");
		built.files.write("/state.json", '{"count":1}');
		expect(built.importAt("/state.json", "/start.js")).toBe(snapshot);
		expect(built.files.read("/state.json")).toBe('{"count":1}');
		expect(built.importAt("/none.js", "/start.js")).toBeUndefined();
		expect(built.importRegistry.has("/none.js")).toBe(true);
		expect(() => built.importAt("/bad.js", "/start.js")).toThrow();
		built.files.write("/bad.js", "export default 42;");
		expect(built.importAt("/bad.js", "/start.js")).toBe(42);
		expect(() => built.importAt("/cycle.js", "/start.js")).toThrow("循环导入");
		expect(resourceType("state.data.json")).toBe("json");
	});

	it("loads every built-in JS default and explicitly executes the context builder and processor", async () => {
		const plugins = importBuiltinPlugins();
		const visit = (tree: PluginData["tree"]) => {
			for (const [name, value] of Object.entries(tree)) {
				if (typeof value !== "string") visit(value);
				else if (name.endsWith(".js"))
					expect(importJavaScript(value, {})).toBeTypeOf("function");
			}
		};
		for (const plugin of Object.values(plugins)) visit(plugin.tree);
		const imported = vi.fn(() => (messages: unknown[]) => [
			...messages,
			{ role: "system", content: "processed" },
		]);
		const builder = importJavaScript(
			readFile(plugins.core!, "/context/build.js"),
			{
				slot: {
					paths: (id: string) =>
						id === "CTX_PROCESS_BEFORE_REGEX" ? ["/processor.js"] : [],
				},
				imports: imported,
			},
		) as () => Promise<unknown>;
		await expect(builder()).resolves.toEqual([
			{ role: "system", content: "processed" },
		]);
		const process = importJavaScript(
			readFile(plugins.core!, "/context/before-regex.js"),
			{},
		) as (messages: unknown[]) => unknown;
		const messages: unknown[] = [];
		expect(process(messages)).toBe(messages);
	});
});
