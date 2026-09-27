import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import {
	appendPluginVersion,
	createPluginVersion,
	preparePluginDocument,
	replayPluginVersion,
} from "./plugin-version";
import { emptyRecal, updateRecal } from "./recalculate";
import { defaultFileMeta } from "./types";
import { replayAndMergePluginData } from "./use-tree-merge";

vi.mock("@/features/Database/dbsync-store", () => ({ useSyncStore: vi.fn() }));
vi.mock("./use-plugin-data", () => ({ refreshCharacter: vi.fn() }));

describe("saved versions and independent sources", () => {
	it("forks cumulative deltas without changing pinned heads, including reactive reloads", () => {
		const document = reactive(
			preparePluginDocument({
				id: "local",
				tree: { a: "old" },
				meta: { "/a": defaultFileMeta() },
			}),
		);
		const first = document.versions[0]!;
		appendPluginVersion(document, first, {
			kind: "file.write",
			path: "/a",
			content: "first",
		});
		const second = createPluginVersion(document, [
			{ kind: "node.move", from: "/a", to: "/b" },
		]);
		document.versions.push(second);
		appendPluginVersion(document, document.versions[1]!, {
			kind: "file.write",
			path: "/b",
			content: "second",
		});
		const loaded = JSON.parse(JSON.stringify(document));
		expect(replayPluginVersion(loaded, first.id).tree).toEqual({ a: "first" });
		expect(replayPluginVersion(loaded, second.id).tree).toEqual({
			b: "second",
		});
		expect(second.parentId).toBe(first.id);
		expect(loaded.tree).toEqual({ a: "old" });
		expect(
			loaded.versions.every(
				(version: object) => !Object.hasOwn(version, "pulses"),
			),
		).toBe(true);
	});
	it("keeps inactive sources replayed and skips deleted sources without losing their delta", () => {
		const local = {
			id: "local",
			tree: { local: "L", "definition.package.json": '{"globalPlugins":[]}' },
			meta: {},
		};
		const source = {
			id: "plugin",
			tree: { file: "old" },
			meta: { "/file": defaultFileMeta() },
		};
		const global = { plugin: source };
		const baseline = replayAndMergePluginData(local, global, []);
		let recal = updateRecal(baseline, emptyRecal(), {
			kind: "file.write",
			path: "/global/plugin/file",
			content: "new",
		});
		recal = updateRecal(baseline, recal, {
			kind: "file.write",
			path: "/local",
			content: "changed",
		});
		const stored = JSON.stringify(recal);
		expect(
			replayAndMergePluginData(local, global, [recal]).tree.global,
		).toEqual({ plugin: { file: "new" } });
		expect(replayAndMergePluginData(local, {}, [recal]).tree).toEqual({
			local: "changed",
			"definition.package.json": '{"globalPlugins":[]}',
			global: {},
		});
		expect(JSON.stringify(recal)).toBe(stored);
		expect(source.tree.file).toBe("old");
		expect(local.tree.local).toBe("L");
	});
});
