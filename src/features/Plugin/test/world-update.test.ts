import { describe, expect, it } from "vitest";
import { applyPulse, createPulse, describePulse } from "../tree/world-update";
import { createWorldDocument, createWorldFile, createWorldFolder, type World } from "../tree/world-types";

function fixture(): World {
	const global = createWorldDocument("global", "global"); const self = createWorldDocument("local:test", "self");
	const source = createWorldFolder("source", { id: "source" }); const target = createWorldFolder("target", { id: "target" }); const file = createWorldFile("same.md", "original", { id: "file" });
	source.children.file = file; self.root.children.source = source; self.root.children.target = target; return { global, self };
}
describe("Pulse", () => {
	it("replays write, replace, allowed metadata, create, delete, move and copy by stable IDs", () => {
		const world = fixture(); const created = createWorldFile("new.md", "new", { id: "new" });
		applyPulse(world, createPulse([{ kind: "node.create", scope: "self", parentId: "source", node: created }, { kind: "file.write", scope: "self", nodeId: "file", content: "draft", filename: "same.md" }, { kind: "file.replace", scope: "self", nodeId: "file", find: "draft", replace: "final", filename: "same.md" }, { kind: "file.meta.patch", scope: "self", nodeId: "file", patch: { priority: 1 }, filename: "same.md" }, { kind: "node.copy", scope: "self", source: { scope: "self", id: "file" }, targetParentId: "target", idMap: { file: "copied-file" }, nameAtTime: "same.md" }, { kind: "node.move", scope: "self", nodeId: "new", parentId: "source", targetParentId: "target", nameAtTime: "new.md" }, { kind: "node.delete", scope: "self", nodeId: "file", parentId: "source", nameAtTime: "same.md" }]));
		expect(world.self.root.children.source.type).toBe("folder"); expect((world.self.root.children.source as ReturnType<typeof createWorldFolder>).children.file).toBeUndefined();
		const target = world.self.root.children.target as ReturnType<typeof createWorldFolder>; expect(target.children.new).toBeTruthy(); expect((target.children["copied-file"] as ReturnType<typeof createWorldFile>).content).toBe("final");
	});
	it("rejects structural metadata patches and derives UI text", () => {
		const world = fixture(); const pulse = createPulse([{ kind: "file.meta.patch", scope: "self", nodeId: "file", patch: { priority: 2 }, filename: "same.md" }]);
		expect(describePulse(pulse)).toContain("更新");
		expect(() => applyPulse(world, createPulse([{ kind: "file.meta.patch", scope: "self", nodeId: "file", patch: { id: "bad" } as never }]))).toThrow("不允许修改");
	});
});
