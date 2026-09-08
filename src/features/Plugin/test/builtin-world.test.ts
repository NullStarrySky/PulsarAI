import { describe, expect, it } from "vitest";
import {
	createBuiltinGlobalWorld,
	createLocalPluginWorld,
} from "../tree/builtin-world";
import { createWorldNodeIndex } from "../tree/world-update";

describe("built-in World", () => {
	it("assigns a unique ID to every built-in resource", () => {
		const world = createBuiltinGlobalWorld();

		expect(() => createWorldNodeIndex(world)).not.toThrow();
		const template = world.root.children["builtin-default-plugin"];
		expect(template?.type).toBe("folder");
		if (template?.type !== "folder") return;
		expect(template.children["builtin-default-template-chat"]?.id).toBe(
			"builtin-default-template-chat",
		);
	});

	it("puts every source-local contribution below localSlot with a stable parent", () => {
		const world = createBuiltinGlobalWorld();
		const source = world.root.children["builtin-default-plugin"];
		expect(source?.type).toBe("folder");
		if (source?.type !== "folder") return;
		const localRoot = source.children["builtin-default-plugin:localSlot"];
		expect(localRoot?.type).toBe("folder");
		if (localRoot?.type !== "folder") return;
		const chatSlot =
			localRoot.children["builtin-default-plugin:localSlot:chat"];
		expect(chatSlot?.type).toBe("folder");
		if (chatSlot?.type !== "folder") return;
		expect(chatSlot.parent).toBe("/self/slot/$generation/$chat");
		const chat = source.children["builtin-default-template-chat"];
		expect(chat?.type).toBe("file");
		if (chat?.type !== "file") return;
		expect(chat.slot).toBe(
			"/global/$builtin-default-plugin/$builtin-default-plugin:localSlot/$builtin-default-plugin:localSlot:chat",
		);
	});

	it("creates both global and local slot roots for a package World", () => {
		const world = createLocalPluginWorld("test");
		expect(world.root.children.slot?.type).toBe("folder");
		const localRoot = world.root.children.localSlot;
		expect(localRoot?.type).toBe("folder");
	});
});
