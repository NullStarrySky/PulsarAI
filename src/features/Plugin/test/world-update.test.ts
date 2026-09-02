import { describe, expect, it } from "vitest";
import {
	applyWorldUpdate,
	applyWorldUpdates,
} from "../tree/world-update";
import {
	createWorldDocument,
	createWorldFile,
	createWorldFolder,
	type World,
} from "../tree/world-types";

function createWorld(): World {
	const global = createWorldDocument("global", "global");
	const self = createWorldDocument("package:test", "self");
	const source = createWorldFolder("source", { id: "source" });
	const target = createWorldFolder("target", { id: "target" });
	const nested = createWorldFolder("nested", { id: "nested" });
	const file = createWorldFile("same.md", "original", { id: "file" });
	source.children[file.id] = file;
	source.children[nested.id] = nested;
	self.root.children[source.id] = source;
	self.root.children[target.id] = target;
	return { global, self };
}

describe("World ID-addressed updates", () => {
	it("copies a subtree with remapped IDs while retaining duplicate display names", () => {
		const world = createWorld();
		const targetBeforeCopy = world.self.root.children.target!;
		if (targetBeforeCopy.type !== "folder") return;
		targetBeforeCopy.children.existing = createWorldFolder("source", {
			id: "existing-source",
		});
		applyWorldUpdates(world, [
			{
				scope: "self",
				nodeId: "target",
				path: ["children", "copied-source"],
				value: {
					type: "copy",
					source: { scope: "self", id: "source" },
					idMap: {
						source: "copied-source",
						nested: "copied-nested",
						file: "copied-file",
					},
				},
			},
			{
				scope: "self",
				nodeId: "copied-source",
				path: ["name"],
				value: { type: "value", value: "source" },
			},
		]);

		const target = world.self.root.children.target!;
		expect(target.type).toBe("folder");
		if (target.type !== "folder") return;
		const copied = target.children["copied-source"]!;
		expect(copied.name).toBe("source");
		expect(copied.id).toBe("copied-source");
		if (copied.type !== "folder") return;
		expect(copied.children["copied-file"]?.id).toBe("copied-file");
		expect(target.children.existing?.name).toBe("source");
		expect(world.self.root.children.source?.name).toBe("source");
	});

	it("updates a nested field from its node ID without replaying a long name path", () => {
		const world = createWorld();
		applyWorldUpdate(world, {
			scope: "self",
			nodeId: "file",
			path: ["content"],
			value: { type: "value", value: "updated" },
		});

		const source = world.self.root.children.source!;
		if (source.type !== "folder") return;
		const updated = source.children.file;
		expect(updated?.type).toBe("file");
		if (!updated || updated.type !== "file") return;
		expect(updated.content).toBe("updated");
	});

	it("moves by ID without serializing or changing the node identity", () => {
		const world = createWorld();
		const source = world.self.root.children.source!;
		if (source.type !== "folder") return;
		const file = source.children.file!;
		applyWorldUpdate(world, {
			scope: "self",
			nodeId: "target",
			path: ["children", "file"],
			value: { type: "move", source: { scope: "self", id: "file" } },
		});

		const target = world.self.root.children.target!;
		expect(source.children.file).toBeUndefined();
		expect(target.type).toBe("folder");
		if (target.type === "folder") expect(target.children.file).toBe(file);
	});

	it("rejects moving a folder into its descendant", () => {
		const world = createWorld();
		expect(() =>
			applyWorldUpdate(world, {
				scope: "self",
				nodeId: "nested",
				path: ["children", "source"],
				value: { type: "move", source: { scope: "self", id: "source" } },
			}),
		).toThrow("自身或其子级");
	});
});
