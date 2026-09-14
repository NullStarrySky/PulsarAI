import { describe, expect, it } from "vitest";
import { shallowRef } from "vue";
import { readFile } from "../dataflow/pulse";
import type { PluginData, ReplayGroups } from "../dataflow/types";
import {
	replayAndMergePluginData,
	useActivePluginData,
} from "../dataflow/use-plugin-data";
import { useSlot } from "../dataflow/use-slot";
import { importBuiltinPlugins } from "../utils/import-converter";

function plugin(id: string, tree: PluginData["tree"]): PluginData {
	return { id, tree, meta: {} };
}

describe("replayAndMergePluginData", () => {
	it("addresses every built-in Plugin by its source folder name", () => {
		expect(Object.keys(importBuiltinPlugins()).sort()).toEqual([
			"blank",
			"core",
			"default",
		]);
	});

	it("replays inactive sources for UI while excluding them from the active projection", () => {
		const local = plugin("role", {
			"definition.package.json": JSON.stringify({
				name: "角色",
				globalPlugins: ["core", "extra"],
			}),
		});
		const global = {
			core: plugin("builtin-core-plugin", { "value.txt": "core" }),
			extra: plugin("extra-plugin", { "value.txt": "extra" }),
			disabled: plugin("disabled-plugin", { "value.txt": "disabled" }),
		};
		const groups: ReplayGroups = [
			[
				{ kind: "file.write", path: "/global/core/value.txt", content: "C" },
				{ kind: "file.write", path: "/global/extra/value.txt", content: "E" },
				{
					kind: "file.write",
					path: "/global/disabled/value.txt",
					content: "D",
				},
			],
		];

		const result = replayAndMergePluginData(local, global, groups);
		expect(readFile(result, "/global/core/value.txt")).toBe("C");
		expect(readFile(result, "/global/extra/value.txt")).toBe("E");
		expect(readFile(result, "/global/disabled/value.txt")).toBe("D");
		const active = useActivePluginData(() => result).value!;
		expect(() => readFile(active, "/global/disabled/value.txt")).toThrow();
		expect(active.tree.global).toEqual({
			core: { "value.txt": "C" },
			extra: { "value.txt": "E" },
		});
		expect((active.tree.global as PluginData["tree"]).core).toBe(
			(result.tree.global as PluginData["tree"]).core,
		);
		expect(global.disabled.tree["value.txt"]).toBe("disabled");
	});

	it("switches active sources without replaying or changing inactive metadata", () => {
		const local = plugin("role", {
			"definition.package.json": JSON.stringify({ globalPlugins: [] }),
			slot: { context: {} },
		});
		local.meta["/slot/context"] = { selectionMode: "multiple" };
		const extra = plugin("extra", {
			"value.txt": "old",
			localSlot: { context: {} },
		});
		extra.meta["/value.txt"] = {
			resourceSelected: true,
			priority: 100,
			slot: "/localSlot/context",
		};
		extra.meta["/localSlot/context"] = {
			selectionMode: "none",
			parent: "/slot/context",
		};
		const result = replayAndMergePluginData(local, { extra }, [
			[
				{
					kind: "file.write",
					path: "/global/extra/value.txt",
					content: "current",
				},
			],
		]);
		const filetree = shallowRef(result);
		const active = useActivePluginData(filetree);
		const slots = useSlot({ filetree: active, applyPulse: () => undefined });
		expect(slots.paths("/slot/context")).toEqual([]);
		expect(active.value!.meta["/global/extra/value.txt"]).toBeUndefined();
		filetree.value = {
			...result,
			tree: {
				...result.tree,
				"definition.package.json": JSON.stringify({ globalPlugins: ["extra"] }),
			},
		};
		expect(readFile(active.value!, "/global/extra/value.txt")).toBe("current");
		expect(slots.paths("/slot/context")).toEqual(["/global/extra/value.txt"]);
		expect(active.value!.meta["/global/extra/value.txt"]).toBe(
			result.meta["/global/extra/value.txt"],
		);
		expect(result.meta["/global/extra/value.txt"]).toMatchObject({
			slot: "/global/extra/localSlot/context",
		});
		expect(extra.meta["/value.txt"]).toMatchObject({
			slot: "/localSlot/context",
		});
	});

	it("uses a replayed role definition to dynamically enable a source", () => {
		const local = plugin("role", {
			"definition.package.json": JSON.stringify({
				name: "角色",
				globalPlugins: [],
			}),
		});
		const groups: ReplayGroups = [
			[
				{ kind: "file.write", path: "/global/extra/value.txt", content: "new" },
				{
					kind: "file.write",
					path: "/definition.package.json",
					content: JSON.stringify({
						name: "角色",
						globalPlugins: ["extra"],
					}),
				},
			],
		];

		const result = replayAndMergePluginData(
			local,
			{ extra: plugin("extra-plugin", { "value.txt": "old" }) },
			groups,
		);
		expect(readFile(result, "/global/extra/value.txt")).toBe("new");
	});
});
