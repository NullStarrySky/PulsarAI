import { describe, expect, it, vi } from "vitest";
import { watch } from "vue";
import {
	createChat,
	persistChat,
} from "@/features/Conversation/chats/chat-service";
import {
	createContainer,
	currentMessage,
	loadContainersForChat,
	persistContainer,
} from "@/features/Conversation/messages/message-service";
import { resetMockHostDatabase } from "@/features/Database/mock-database";
import { getConversationSharedState } from "@/features/Conversation/conversation-shared-state";
import { host } from "@/host";
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

	it("reuses the last pure Pulse container without exposing a missing active tail", async () => {
		resetMockHostDatabase();
		const localPluginId = "local-pulse-container-test";
		const chat = await createChat({ localPluginId });
		await persistChat(chat);
		await initializeWorlds(localPluginId);
		const state = getConversationSharedState(chat.id);
		state.chat.value = chat;
		state.containers.value = [];
		const missingTails: string[] = [];
		const stop = watch(
			() => [state.chat.value?.lastContainerId, state.containers.value.map((item) => item.id)] as const,
			([tail, ids]) => {
				if (tail && !ids.includes(tail)) missingTails.push(tail);
			},
			{ deep: true, flush: "sync" },
		);

		const world = useWorld({ localPluginId, conversationId: chat.id, applyReplay: true });
		await world.write("/self/test.md", "first");
		await world.write("/self/test.md", "second");
		stop();

		const containers = await loadContainersForChat(chat.id);
		const pulseContainers = containers.filter(
			(item) => item.role === "system" && currentMessage(item)?.meta.pulses?.length,
		);
		expect(pulseContainers).toHaveLength(1);
		expect(missingTails).toEqual([]);
	});

	it("publishes replay changes before queued conversation persistence completes", async () => {
		resetMockHostDatabase();
		const localPluginId = "local-optimistic-replay-test";
		const chat = await createChat({ localPluginId });
		await persistChat(chat);
		await initializeWorlds(localPluginId);
		const sourceWorld = useWorld({ localPluginId, applyReplay: false });
		await sourceWorld.write("/self/selected.txt", "initial");

		let releasePersistence!: () => void;
		let persistenceStarted!: () => void;
		const release = new Promise<void>((resolve) => {
			releasePersistence = resolve;
		});
		const started = new Promise<void>((resolve) => {
			persistenceStarted = resolve;
		});
		const originalUpsert = host.database.upsert.bind(host.database);
		let blocked = false;
		const upsert = vi.spyOn(host.database, "upsert").mockImplementation(
			async (table, id, value) => {
				if (table === "message_containers" && !blocked) {
					blocked = true;
					persistenceStarted();
					await release;
				}
				await originalUpsert(table, id, value);
			},
		);

		try {
			const world = useWorld({
				localPluginId,
				conversationId: chat.id,
				applyReplay: true,
			});
			const first = world.write("/self/selected.txt", "first");
			await started;
			expect(world.read("/self/selected.txt")).toBe("first");

			const second = world.write("/self/selected.txt", "second");
			await vi.waitFor(() => {
				expect(world.read("/self/selected.txt")).toBe("second");
			});
			releasePersistence();
			await Promise.all([first, second]);

			const containers = await loadContainersForChat(chat.id);
			const pulseContainers = containers.filter(
				(item) => item.role === "system" && currentMessage(item)?.meta.pulses?.length,
			);
			expect(pulseContainers).toHaveLength(1);
			expect(currentMessage(pulseContainers[0]!)?.meta.pulses).toHaveLength(1);
		} finally {
			releasePersistence();
			upsert.mockRestore();
		}
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

	it("binds generated writes to its exact message version and compacts them", async () => {
		const { createWorldSelfApi } = await import("../runtime/self-api");
		resetMockHostDatabase();
		const localPluginId = "local-message-version-test";
		const chat = await createChat({ localPluginId });
		await persistChat(chat);
		await initializeWorlds(localPluginId);
		const sourceWorld = useWorld({ localPluginId, applyReplay: false });
		await sourceWorld.write("/self/progress.md", "before generation");

		const container = createContainer({ conversationId: chat.id, role: "assistant", content: "" });
		const message = currentMessage(container)!;
		await persistContainer(container);
		const selfApi = createWorldSelfApi("/self/entry.js", {
			localPluginId,
			conversationId: chat.id,
			container,
			messageVersion: message,
		});

		await selfApi.write("progress.md", "draft");
		expect(selfApi.read("progress.md")).toBe("draft");
		await selfApi.write("progress.md", "final");
		expect(selfApi.read("progress.md")).toBe("final");

		const persisted = (await loadContainersForChat(chat.id)).find((item) => item.id === container.id)!;
		const pulses = currentMessage(persisted)!.meta.pulses!;
		expect(pulses).toHaveLength(1);
		expect(pulses[0]?.operations).toEqual([
			{ kind: "file.write", scope: "self", nodeId: sourceWorld.resolve("/self/progress.md").node.id, content: "final", filename: "progress.md" },
		]);
	});
});
