import { describe, expect, it } from "vitest";
import { applyPulse, clonePluginData } from "./pulse";
import {
	emptyRecal,
	recalSize,
	replayPluginData,
	replayRecalculate,
	updateRecal,
	updateRecalculate,
} from "./recalculate";
import {
	defaultFileMeta,
	type PluginData,
	type Pulse,
	type Recalculate,
} from "./types";

function fixture(): PluginData {
	return {
		id: "test",
		tree: { a: { b: "zero", other: "keep" }, x: "X" },
		meta: {
			"/a/b": defaultFileMeta(),
			"/a/other": defaultFileMeta(),
			"/x": defaultFileMeta(),
		},
	};
}
function run(operations: Pulse[], base = fixture()) {
	let delta: Recalculate = {};
	const expected = clonePluginData(base);
	for (const operation of operations) {
		applyPulse(expected, operation);
		delta = updateRecalculate(base, delta, operation);
		// Round trip each intermediate state, including shuffled record order.
		delta = JSON.parse(JSON.stringify(delta));
		expect(
			replayRecalculate(
				base,
				Object.fromEntries(Object.entries(delta).reverse()),
			),
		).toEqual(expected);
	}
	return delta;
}

describe("final-path replay", () => {
	it("tracks nested renames against the original paths", () => {
		const delta = run([
			{ kind: "node.move", from: "/a", to: "/c" },
			{ kind: "node.move", from: "/c/b", to: "/c/d" },
		]);
		expect(delta).toEqual({
			"/a": { delete: true },
			"/c": { kind: "folder", from: "/a" },
			"/c/b": { delete: true },
			"/c/d": { kind: "file", from: "/a/b", edit: null, meta_edit: null },
		});
	});
	it("stores one directory inheritance instead of moves for every child", () => {
		expect(
			Object.keys(run([{ kind: "node.move", from: "/a", to: "/c" }])),
		).toHaveLength(2);
	});
	it("preserves a copy's content and metadata at copy time", () => {
		run([
			{ kind: "file.write", path: "/a/b", content: "one" },
			{ kind: "file.meta.patch", path: "/a/b", patch: { priority: 7 } },
			{ kind: "node.copy", from: "/a/b", to: "/copy" },
			{ kind: "file.write", path: "/a/b", content: "two" },
			{ kind: "file.meta.patch", path: "/a/b", patch: { priority: 9 } },
			{ kind: "node.remove", path: "/a" },
		]);
	});
	it("copies modified directories including deletions, new files and empty folders", () => {
		run([
			{ kind: "node.remove", path: "/a/b" },
			{ kind: "file.write", path: "/a/new", content: "new" },
			{ kind: "folder.mkdir", path: "/a/empty" },
			{ kind: "file.write", path: "/a/other", content: "changed" },
			{ kind: "node.copy", from: "/a", to: "/copy" },
			{ kind: "node.move", from: "/copy", to: "/final" },
			{ kind: "node.remove", path: "/a/new" },
		]);
	});
	it("handles swaps and replacing a deleted destination", () => {
		run([
			{ kind: "node.move", from: "/a/b", to: "/temp" },
			{ kind: "node.move", from: "/x", to: "/a/b" },
			{ kind: "node.move", from: "/temp", to: "/x" },
			{ kind: "node.remove", path: "/a" },
			{ kind: "node.move", from: "/x", to: "/a" },
		]);
	});
	it("represents delete/recreate and file/folder replacement without old children", () => {
		run([
			{ kind: "node.remove", path: "/a" },
			{ kind: "folder.mkdir", path: "/a" },
			{ kind: "file.write", path: "/a/b", content: "" },
			{ kind: "node.remove", path: "/x" },
			{ kind: "folder.mkdir", path: "/x/nested" },
		]);
	});
	it("drops net-zero edits, creations and round-trip moves", () => {
		expect(
			run([
				{ kind: "file.write", path: "/a/b", content: "change" },
				{ kind: "file.write", path: "/a/b", content: "zero" },
				{ kind: "folder.mkdir", path: "/new/nested" },
				{ kind: "node.remove", path: "/new" },
				{ kind: "node.move", from: "/a", to: "/c" },
				{ kind: "node.move", from: "/c", to: "/a" },
			]),
		).toEqual({});
	});
	it("supports metadata removal and content edits after moving a parent", () => {
		const base = fixture();
		base.meta["/a/b"]!.slot = "/chat";
		run(
			[
				{ kind: "node.move", from: "/a", to: "/c" },
				{
					kind: "file.meta.patch",
					path: "/c/b",
					patch: { slot: undefined, priority: 1 },
				},
				{ kind: "file.write", path: "/c/b", content: "文本\n🙂\nnew" },
			],
			base,
		);
	});
	it("rejects changed content baselines and leaves inputs untouched on failure", () => {
		const base = fixture(),
			saved = clonePluginData(base);
		const delta = updateRecalculate(
			base,
			{},
			{ kind: "file.write", path: "/a/b", content: "changed" },
		);
		expect(() =>
			updateRecalculate(base, delta, {
				kind: "node.move",
				from: "/a",
				to: "/x",
			}),
		).toThrow();
		expect(base).toEqual(saved);
		base.tree.a = { b: "drift", other: "keep" };
		expect(() => replayRecalculate(base, delta)).toThrow("基线内容已改变");
	});
	it("replays groups sequentially while keeping sibling versions independent", () => {
		const base = fixture();
		const first = updateRecalculate(
			base,
			{},
			{ kind: "node.move", from: "/a", to: "/c" },
		);
		const previous = replayRecalculate(base, first);
		const second = updateRecalculate(
			previous,
			{},
			{ kind: "file.write", path: "/c/b", content: "next" },
		);
		const sibling = updateRecalculate(
			previous,
			{},
			{ kind: "file.write", path: "/c/b", content: "sibling" },
		);
		expect(replayPluginData(base, [first, second]).tree.c).toEqual({
			b: "next",
			other: "keep",
		});
		expect(replayPluginData(base, [first, sibling]).tree.c).toEqual({
			b: "sibling",
			other: "keep",
		});
	});
	it("routes source-local deltas and preserves missing-source records", () => {
		const base = fixture();
		base.tree.global = { plugin: { file: "old" } };
		base.meta["/global/plugin/file"] = defaultFileMeta();
		let recal = emptyRecal();
		recal.global.missing = { "/file": { delete: true } };
		recal = updateRecal(base, recal, {
			kind: "file.write",
			path: "/global/plugin/file",
			content: "new",
		});
		recal = updateRecal(base, recal, {
			kind: "node.move",
			from: "/a",
			to: "/c",
		});
		expect(recal.global.plugin?.["/file"]).toMatchObject({ from: "/file" });
		expect(recal.global.missing).toEqual({ "/file": { delete: true } });
		expect(recalSize(recal)).toBe(4);
		expect(() =>
			updateRecal(base, recal, {
				kind: "node.copy",
				from: "/x",
				to: "/global/plugin/x",
			}),
		).toThrow("跨 Plugin");
	});
});
