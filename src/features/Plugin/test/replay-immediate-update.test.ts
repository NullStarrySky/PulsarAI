import { describe, expect, it } from "vitest";
import {
	createChat,
	persistChat,
} from "@/features/Conversation/chats/chat-service";
import { loadContainersForChat } from "@/features/Conversation/messages/message-service";
import { resetMockHostDatabase } from "@/features/Database/mock-database";
import { initializeWorlds, useWorld } from "../tree/world-store";

describe("Conversation as Disk with Immediate World File Tree Update", () => {
	it("immediately mutates in-memory world file tree upon write without waiting for reactivity", async () => {
		resetMockHostDatabase();

		const localPluginId = "local-replay-test";
		const chat = await createChat({ localPluginId });
		await persistChat(chat);
		await initializeWorlds(localPluginId);

		const world = useWorld({
			localPluginId,
			conversationId: chat.id,
			applyReplay: true,
		});

		// 1. Write file
		await world.write("/self/test-doc.md", "# Hello from Plugin");

		// 2. Immediate read & exists without waiting for any reactivity tick
		expect(world.exists("/self/test-doc.md")).toBe(true);
		expect(world.read("/self/test-doc.md")).toBe("# Hello from Plugin");

		// 3. Check that the primitives were persisted to the conversation container (conversation as disk)
		const containers = await loadContainersForChat(chat.id);
		const hiddenContainer = containers.find(
			(c) => c.role === "system" && c.content[0]?.meta?.pulses?.length,
		);
		expect(hiddenContainer).toBeDefined();
		expect(
			hiddenContainer?.content[0]?.meta?.pulses?.length,
		).toBeGreaterThan(0);

		// 4. Edit file and verify immediate read
		await world.edit("/self/test-doc.md", "Hello", "Greetings");
		expect(world.read("/self/test-doc.md")).toBe("# Greetings from Plugin");

		// 5. Remove file and verify immediate check
		await world.remove("/self/test-doc.md");
		expect(world.exists("/self/test-doc.md")).toBe(false);
	});

	it("works seamlessly with createWorldSelfApi for immediate read-after-write", {
		timeout: 20_000,
	}, async () => {
		const { createWorldSelfApi } = await import("../runtime/self-api");
		resetMockHostDatabase();

		const localPluginId = "local-api-test";
		const chat = await createChat({ localPluginId });
		await persistChat(chat);
		await initializeWorlds(localPluginId);

		const selfApi = createWorldSelfApi("/self/entry.js", {
			localPluginId,
			conversationId: chat.id,
		});

		// Write relative to /self
		await selfApi.write("notes.txt", "Self API note content");

		// Immediately read
		expect(selfApi.exists("notes.txt")).toBe(true);
		expect(selfApi.read("notes.txt")).toBe("Self API note content");

		// Nested mkdir and write
		await selfApi.mkdir("docs");
		await selfApi.write("docs/spec.md", "# Specifications");
		expect(selfApi.read("docs/spec.md")).toBe("# Specifications");

		// Edit
		await selfApi.edit("docs/spec.md", "Specifications", "Requirements");
		expect(selfApi.read("docs/spec.md")).toBe("# Requirements");

		// Verify conversation container holds all primitives
		const containers = await loadContainersForChat(chat.id);
		const hiddenContainer = containers.find(
			(c) => c.role === "system" && c.content[0]?.meta?.pulses?.length,
		);
		expect(hiddenContainer).toBeDefined();
		expect(
			hiddenContainer?.content[0]?.meta?.pulses?.length,
		).toBeGreaterThan(0);
	});
});
