import { beforeEach, describe, expect, it } from "vitest";
import {
	createChat,
	persistChat,
} from "@/features/Conversation/chats/chat-service";
import { resetMockHostDatabase } from "@/features/Database/mock-database";
import { initializeWorlds, useWorld } from "../tree/world-store";
import type { WorldFileNode } from "../tree/world-types";

beforeEach(() => {
	resetMockHostDatabase();
});

async function setupReplayWorld() {
	const localPluginId = crypto.randomUUID();
	const chat = await createChat({ localPluginId });
	await persistChat(chat);
	await initializeWorlds(localPluginId);
	return useWorld({ localPluginId, conversationId: chat.id, applyReplay: true });
}

function fileNode(
	world: ReturnType<typeof useWorld>,
	path: string,
): WorldFileNode {
	const node = world.resolve(path).node;
	if (node.type !== "file") throw new Error(`不是文件：${path}`);
	return node;
}

function stablePath(world: ReturnType<typeof useWorld>, path: string) {
	return `/self/$${fileNode(world, path).id}`;
}

describe("World filesystem operations", () => {
	it("mkdir, write, edit, and read operate on the replayed tree immediately", async () => {
		const world = await setupReplayWorld();

		await world.mkdir("/self/notes/deep");
		await world.write("/self/notes/deep/doc.md", "first draft");
		expect(world.read("/self/notes/deep/doc.md")).toBe("first draft");

		await world.edit("/self/notes/deep/doc.md", "draft", "version");
		expect(world.read("/self/notes/deep/doc.md")).toBe("first version");

		// edit requires the find text to exist
		await expect(
			world.edit("/self/notes/deep/doc.md", "missing", "x"),
		).rejects.toThrow("World 文本替换失败");
	});

	it("move keeps node IDs while copy regenerates the subtree IDs", async () => {
		const world = await setupReplayWorld();

		await world.mkdir("/self/source");
		await world.write("/self/source/file.md", "content");
		const sourceId = world.resolve("/self/source/file.md").node.id;

		await world.move("/self/source/file.md", "/self/renamed.md");
		expect(world.exists("/self/source/file.md")).toBe(false);
		expect(world.resolve("/self/renamed.md").node.id).toBe(sourceId);

		await world.copy("/self/renamed.md", "/self/source", "copy.md");
		const copied = world.resolve("/self/source/copy.md").node as WorldFileNode;
		expect(copied.id).not.toBe(sourceId);
		expect(copied.content).toBe("content");
		expect(world.exists("/self/renamed.md")).toBe(true);

		// Moving a folder below itself is rejected
		await expect(
			world.move("/self/source", "/self/source/inner"),
		).rejects.toThrow("不能将文件夹移动到自身或其子级");
	});

	it("remove deletes a node and ambiguous name paths fall back to $id paths", async () => {
		const world = await setupReplayWorld();

		await world.mkdir("/self/inner");
		await world.write("/self/inner/dup.md", "two");
		await world.remove("/self/inner/dup.md");
		expect(world.exists("/self/inner/dup.md")).toBe(false);

		// Two same-named siblings make the name path ambiguous; $id stays exact.
		await world.createFile("/self/inner", "dup.md", "one");
		await world.createFile("/self/inner", "dup.md", "two");
		expect(() => world.resolve("/self/inner/dup.md")).toThrow(
			/World 路径不明确/,
		);
		const inner = world.resolve("/self/inner").node;
		expect(inner.type).toBe("folder");
		if (inner.type !== "folder") return;
		const firstId = Object.values(inner.children)
			.filter((child): child is WorldFileNode => child.type === "file")
			.find((child) => child.content === "one")!.id;
		const resolved = world.resolve(`/self/$${firstId}`).node;
		expect(resolved.type).toBe("file");
		if (resolved.type === "file") {
			expect(resolved.content).toBe("one");
		}
		expect(world.exists("/self/inner/dup.md")).toBe(true);
	});
});

describe("Slot folder creation and resource migration", () => {
	it("creates a sub-slot that inherits the contract and migrates local-slot members", async () => {
		const world = await setupReplayWorld();

		await world.mkdir("/self/notes");
		await world.write("/self/notes/alpha.md", "Alpha");
		await world.write("/self/notes/beta.md", "Beta");
		const alphaPath = stablePath(world, "/self/notes/alpha.md");
		const betaPath = stablePath(world, "/self/notes/beta.md");

		// Build a single-choice markdown slot the same way the asset panel does.
		const pickPath = await world.createFolder("/self/slot", "pick");
		await world.updateFolder(pickPath, {
			selectionMode: "single",
			allowedResourceTypes: ["markdown"],
		});

		await world.assignResourceToSlot(alphaPath, pickPath);
		await world.assignResourceToSlot(betaPath, pickPath);

		const pick = world.slots.value.find((slot) => slot.path === pickPath)!;
		expect(pick.allResources.map((item) => item.path).sort()).toEqual(
			[alphaPath, betaPath].sort(),
		);

		// Creating a child under the slot inherits the contract and pulls the
		// assigned resources (through their local slot) into the new sub-slot.
		const subPath = await world.createFolder(pickPath, "deep");
		const sub = world.slots.value.find((slot) => slot.path === subPath)!;
		expect(sub.selectionMode).toBe("single");
		expect(sub.allowedResourceTypes).toEqual(["markdown"]);
		expect(sub.allResources.map((item) => item.path).sort()).toEqual(
			[alphaPath, betaPath].sort(),
		);

		const migratedPick = world.slots.value.find(
			(slot) => slot.path === pickPath,
		)!;
		expect(migratedPick.allResources).toEqual([]);

		// Single-choice behavior still works inside the migrated sub-slot.
		await world.setSelected(alphaPath, true);
		const afterSelect = world.slots.value.find(
			(slot) => slot.path === subPath,
		)!;
		expect(afterSelect.resources.map((item) => item.path)).toEqual([alphaPath]);
	});

	it("migrates resources that point at the slot contract directly", async () => {
		const world = await setupReplayWorld();

		await world.write("/self/direct.md", "Direct");
		const directPath = stablePath(world, "/self/direct.md");

		const pickPath = await world.createFolder("/self/slot", "pick");
		await world.updateFile(directPath, { slot: pickPath });
		const pick = world.slots.value.find((slot) => slot.path === pickPath)!;
		expect(pick.allResources.map((item) => item.path)).toEqual([directPath]);

		const subPath = await world.createFolder(pickPath, "deep");
		expect(fileNode(world, directPath).slot).toBe(subPath);
		expect(
			world.slots.value
				.find((slot) => slot.path === pickPath)!
				.allResources.map((item) => item.path),
		).toEqual([]);
		expect(
			world.slots.value
				.find((slot) => slot.path === subPath)!
				.allResources.map((item) => item.path),
		).toEqual([directPath]);
	});

	it("creates plain folders without slot contracts outside /self/slot", async () => {
		const world = await setupReplayWorld();

		const folderPath = await world.createFolder("/self", "docs");
		const folder = world.resolve(folderPath).node;
		expect(folder.type).toBe("folder");
		if (folder.type === "folder") {
			expect(folder.selectionMode).toBeUndefined();
			expect(folder.allowedResourceTypes).toBeUndefined();
		}
		expect(world.slots.value.some((slot) => slot.path === folderPath)).toBe(
			false,
		);
	});

	it("single-choice slots keep exactly one selected resource via open/close/toggle", async () => {
		const world = await setupReplayWorld();

		await world.write("/self/one.md", "One");
		await world.write("/self/two.md", "Two");
		const onePath = stablePath(world, "/self/one.md");
		const twoPath = stablePath(world, "/self/two.md");

		const pickPath = await world.createFolder("/self/slot", "pick");
		await world.updateFolder(pickPath, {
			selectionMode: "single",
			allowedResourceTypes: ["markdown"],
		});
		await world.assignResourceToSlot(onePath, pickPath);
		await world.assignResourceToSlot(twoPath, pickPath);

		await world.open(onePath);
		let pick = world.slots.value.find((slot) => slot.path === pickPath)!;
		expect(pick.resources.map((item) => item.path)).toEqual([onePath]);

		await world.open(twoPath);
		pick = world.slots.value.find((slot) => slot.path === pickPath)!;
		expect(pick.resources.map((item) => item.path)).toEqual([twoPath]);

		await world.toggle(twoPath);
		pick = world.slots.value.find((slot) => slot.path === pickPath)!;
		expect(pick.resources).toEqual([]);
	});
});
