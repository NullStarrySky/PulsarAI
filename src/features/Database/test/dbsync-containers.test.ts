import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, nextTick } from "vue";

const { upsert, remove, runWorld } = vi.hoisted(() => ({
	upsert: vi.fn(async () => {}),
	remove: vi.fn(async () => {}),
	runWorld: vi.fn(),
}));
vi.mock("../database-service", () => ({
	selectAll: vi.fn(async () => []),
	selectByField: vi.fn(async () => []),
	selectOne: vi.fn(async () => null),
	upsert,
	remove,
}));
vi.mock("@/features/Plugin/media/media-link", () => ({
	mediaLinks: () => [],
	removeMediaLink: vi.fn(async () => {}),
}));
vi.mock("@/features/Plugin/dataflow", () => ({
	compactPulses: (pulses: unknown[]) => pulses,
	usePluginData: () => computed(() => null),
}));
vi.mock("@/features/Plugin/runtime/run-api", () => ({ runWorld }));
// Avoid loading unrelated attachment/native UI APIs through the barrel.
vi.mock(
	"@/features/Conversation/dataflow/containerComposable",
	async () =>
		await import(
			"@/features/Conversation/dataflow/containerComposable/version"
		),
);

import { useActivePathComposable } from "@/features/Conversation/dataflow/activePathComposable";
import {
	createContainer,
	createMessage,
	pathForTail,
} from "@/features/Conversation/dataflow/activePathComposable/message-service";
import { useContainerBranch } from "@/features/Conversation/dataflow/containerComposable/branch";
import { useContainerVersion } from "@/features/Conversation/dataflow/containerComposable/version";
import {
	markContainerDirty,
	useContainer,
	usePureContainers,
} from "@/features/Conversation/dataflow/containers";
import { createChatMeta } from "@/features/Conversation/dataflow/types";
import { useChat } from "@/features/Conversation/dataflow/chats";
import { useSyncStore } from "../dbsync-store";

function graph() {
	const store = useSyncStore();
	const chat = store.addChat(
		createChatMeta({ localPluginId: "local", pluginVersionId: "v" }),
	);
	const make = (id: string, parent: string | null) => ({
		...createContainer({
			conversationId: chat.id,
			role: "user",
			previousContainer: parent,
		}),
		id,
	});
	const root = make("root", null),
		a = make("a", "root"),
		b = make("b", "root"),
		tail = make("tail", "b");
	root.availableNextContainer = ["a", "b"];
	root.activeNextContainer = "a";
	b.availableNextContainer = ["tail"];
	b.activeNextContainer = "tail";
	a.content.push(createMessage({ content: "second" }));
	chat.rootContainerId = "root";
	chat.lastContainerId = "a";
	const list = store.addContainers(chat.id, [root, a, b, tail]);
	return { store, chat, list };
}

describe("container ID index", () => {
	let scope: ReturnType<typeof effectScope>;
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
		scope = effectScope();
	});
	afterEach(() => {
		scope.stop();
		useSyncStore().clearAll();
	});

	it("tracks insertions, replacements and removals by ID", async () => {
		const { store, chat, list } = graph();
		const lookup = scope.run(() => useContainer(chat.id, "a"))!,
			collection = usePureContainers(chat.id);
		expect(collection.containers.value).toBe(list);
		expect(lookup.value).toBe(list.get("a"));
		const replacement = store.addContainer({
			...list.get("a")!,
			content: [createMessage({ content: "replacement" })],
		});
		expect(list.size).toBe(4);
		expect(lookup.value).toBe(replacement);
		replacement.content[0]!.content = "edited";
		await nextTick();
		await store._sync();
		expect(upsert).toHaveBeenCalledWith(
			"message_containers",
			"a",
			expect.objectContaining({
				content: [expect.objectContaining({ content: "edited" })],
			}),
		);
		list.delete("a");
		expect(lookup.value).toBeNull();
	});

	it("watches only accessed containers and stops with the owning scope", async () => {
		const { store, chat, list } = graph();
		await nextTick();
		await store._sync();
		upsert.mockClear();
		const a = scope.run(() => useContainer(chat.id, "a"))!;
		a.value!.content[0]!.content = "watched edit";
		list.get("b")!.content[0]!.content = "unwatched edit";
		await store._sync();
		expect(
			upsert.mock.calls
				.filter((call) => call[0] === "message_containers")
				.map((call) => call[1]),
		).toEqual(["a"]);
		upsert.mockClear();
		a.value!.content[0]!.content = "edit before unmount";
		scope.stop();
		await store._sync();
		expect(upsert).toHaveBeenCalledWith(
			"message_containers",
			"a",
			expect.anything(),
		);
		upsert.mockClear();
		list.get("a")!.content[0]!.content = "after unmount";
		await store._sync();
		expect(upsert).not.toHaveBeenCalled();
	});

	it("does not interpret cache eviction as a persistent deletion", async () => {
		const { store, chat } = graph();
		scope.run(() => useContainer(chat.id, "a"));
		await nextTick();
		await store._sync();
		upsert.mockClear();
		remove.mockClear();
		store.containers.delete(chat.id);
		await nextTick();
		await store._sync();
		expect(remove).not.toHaveBeenCalled();
		expect(upsert).not.toHaveBeenCalled();
	});

	it("persists background generation without a mounted container handle", async () => {
		const { store, chat, list } = graph();
		list.get("a")!.role = "assistant";
		await nextTick();
		await store._sync();
		upsert.mockClear();
		runWorld.mockImplementation(
			async (input: { message: { content: string } }) => {
				input.message.content = "streamed in background";
				await store._sync();
			},
		);
		await useActivePathComposable(chat.id).generate("a");
		// generate returns through versionAt/goto, which explicitly marks the record.
		await store._sync();
		expect(upsert).toHaveBeenCalledWith(
			"message_containers",
			"a",
			expect.objectContaining({
				content: expect.arrayContaining([
					expect.objectContaining({ content: "streamed in background" }),
				]),
			}),
		);
		upsert.mockClear();
		list.get("a")!.content[0]!.content = "after generation";
		await store._sync();
		expect(upsert).not.toHaveBeenCalled();
	});

	it("follows remembered branch tails without rebuilding the path on a version change", () => {
		const { chat, list } = graph();
		let runs = 0;
		const path = computed(() => {
			runs++;
			return pathForTail(list, chat.lastContainerId);
		});
		expect(path.value.map((c) => c.id)).toEqual(["root", "a"]);
		useContainerVersion(list.get("a")!).goto(1);
		expect(path.value.map((c) => c.id)).toEqual(["root", "a"]);
		expect(runs).toBe(1);
		useContainerBranch(list.get("a")!).goto("b");
		expect(chat.lastContainerId).toBe("tail");
		expect(list.get("root")!.activeNextContainer).toBe("b");
		expect(path.value.map((c) => c.id)).toEqual(["root", "b", "tail"]);
		list.get("tail")!.previousContainer = "root";
		expect(path.value.map((c) => c.id)).toEqual(["root", "tail"]);
		list.get("root")!.previousContainer = "tail";
		expect(path.value).toHaveLength(2);
		expect(pathForTail(list, "missing")).toEqual([]);
	});

	it("replaces only changed groups and keeps the path and unaffected groups", () => {
		const { chat, list } = graph();
		const view = scope.run(() => useActivePathComposable(chat.id))!;
		const a = scope.run(() => useContainer(chat.id, "a"))!;
		const root = scope.run(() => useContainer(chat.id, "root"))!;
		const path = view.activePath.value,
			initial = view.replayGroups.value;
		// A branch pointer alone does not change the chat's authoritative tail.
		root.value!.activeNextContainer = "b";
		expect(view.activePath.value).toBe(path);
		expect(view.replayGroups.value).toBe(initial);
		useContainerVersion(a).goto(1);
		expect(view.activePath.value).toBe(path);
		expect(view.replayGroups.value[0]).toBe(initial[0]);
		expect(view.replayGroups.value[1]!.version).toBe(a.value!.content[1]);
		const selected = view.replayGroups.value;
		a.value!.content[1]!.meta.pulses = [
			{ kind: "file.write", path: "/x.md", content: "x" },
		];
		const withPulse = view.replayGroups.value;
		expect(withPulse[0]).toBe(selected[0]);
		expect(withPulse[1]!.pulses).toBe(a.value!.content[1]!.meta.pulses);
		a.value!.content[1]!.content = "ordinary text edit";
		expect(view.replayGroups.value).toBe(withPulse);
		root.value!.content.push(createMessage());
		useContainerVersion(root).goto(1);
		useContainerVersion(a).goto(0);
		expect(view.replayGroups.value.map((g) => g.version.id)).toEqual([
			root.value!.content[1]!.id,
			a.value!.content[0]!.id,
		]);
		expect(view.activePath.value).toBe(path);
	});

	it("merges branch/version changes independently for multiple consumers", () => {
		const { chat, list } = graph();
		const left = scope.run(() => useActivePathComposable(chat.id))!;
		const right = scope.run(() => useActivePathComposable(chat.id))!;
		const oldLeft = left.replayGroups.value,
			oldRight = right.replayGroups.value;
		useContainerBranch(list.get("a")!).goto("b");
		for (const view of [left, right])
			expect(view.activePath.value.map((c) => c.id)).toEqual([
				"root",
				"b",
				"tail",
			]);
		expect(left.replayGroups.value[0]).toBe(oldLeft[0]);
		expect(right.replayGroups.value[0]).toBe(oldRight[0]);
		list.get("root")!.content.push(createMessage());
		useContainerVersion(list.get("root")!).goto(1);
		useContainerBranch(list.get("b")!).goto("a");
		for (const view of [right, left]) {
			expect(view.replayGroups.value.map((g) => g.version.id)).toEqual(
				view.activePath.value.map((c) => c.content[c.activeMessage ?? 0]!.id),
			);
		}
	});

	it("handles same-tail reparenting, empty versions and unloaded/reloaded maps", () => {
		const { store, chat, list } = graph();
		const view = scope.run(() => useActivePathComposable(chat.id))!;
		const tail = scope.run(() => useContainer(chat.id, "tail"))!;
		useContainerBranch(list.get("a")!).goto("b");
		expect(view.activePath.value.map((c) => c.id)).toEqual([
			"root",
			"b",
			"tail",
		]);
		tail.value!.previousContainer = "root";
		expect(view.activePath.value.map((c) => c.id)).toEqual(["root", "tail"]);
		tail.value!.content.splice(0);
		expect(view.replayGroups.value.map((g) => g.container.id)).toEqual([
			"root",
		]);
		tail.value!.content.push(createMessage());
		expect(view.replayGroups.value.map((g) => g.container.id)).toEqual([
			"root",
			"tail",
		]);
		const replacement = [...list.values()].map((c) => ({ ...c }));
		store.containers.delete(chat.id);
		expect(view.activePath.value).toEqual([]);
		store.addContainers(chat.id, replacement);
		expect(view.activePath.value.map((c) => c.id)).toEqual(["root", "tail"]);
	});

	it("tracks chat edits through useChat without persisting generation", async () => {
		const { store, chat } = graph();
		const handle = scope.run(() => useChat(chat.id))!;
		await store._sync();
		upsert.mockClear();
		handle.value!.generation = { messageId: "running" };
		await store._sync();
		expect(upsert).not.toHaveBeenCalled();
		handle.value!.title = "renamed";
		handle.value!.pluginVersionId = "next";
		expect(store.isPluginVersionUsed("local", "v")).toBe(false);
		expect(store.isPluginVersionUsed("local", "next")).toBe(true);
		await store._sync();
		expect(upsert).toHaveBeenCalledWith(
			"conversations",
			chat.id,
			expect.objectContaining({ title: "renamed", pluginVersionId: "next" }),
		);
		expect(upsert.mock.calls[0]![2]).not.toHaveProperty("generation");
	});

	it("deletes by ID, reconnects descendants and persists record deletion", async () => {
		const { store, chat, list } = graph();
		useContainerBranch(list.get("a")!).goto("b");
		const conversation = useActivePathComposable(chat.id);
		await conversation.deleteContainer("b");
		expect(list.has("b")).toBe(false);
		expect(list.get("tail")!.previousContainer).toBe("root");
		expect(list.get("root")!.availableNextContainer).toEqual(["a", "tail"]);
		expect(conversation.activePath.value.map((c) => c.id)).toEqual([
			"root",
			"tail",
		]);
		await nextTick();
		await store._sync();
		expect(remove).toHaveBeenCalledWith("message_containers", "b");
		await conversation.deleteContainer("root", true);
		expect(list.size).toBe(0);
		expect(chat.lastContainerId).toBeNull();
		await nextTick();
		await store._sync();
		for (const id of ["root", "a", "tail"])
			expect(remove).toHaveBeenCalledWith("message_containers", id);
	});
});
