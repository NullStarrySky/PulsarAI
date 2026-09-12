import { describe, expect, it } from "vitest";
import { importBuiltinPlugins } from "../utils/import-converter";
import { readFile } from "./pulse";
import type { PluginData, ReplayGroups } from "./types";
import { replayAndMergePluginData } from "./use-plugin-data";

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

	it("replays each source before merging the enabled global folders", () => {
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
		expect(() => readFile(result, "/global/disabled/value.txt")).toThrow();
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
