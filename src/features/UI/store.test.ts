import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, nextTick } from "vue";
import { createConversationMeta } from "@/features/Conversation/dataflow/types";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { host } from "@/host";
import { useUIStore } from "./store";
import { popOutTarget } from "./subWindow/sub-window-service";

vi.mock("notivue", () => ({ push: { info: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/Environment/setting/pages", () => ({
	builtInSettingPages: [],
}));
vi.mock("./subWindow/sub-window-service", () => ({
	popOutTarget: vi.fn(async () => true),
}));
vi.mock("@/features/Conversation/dataflow/conversations", () => ({
	isConversationGenerating: (id: string) =>
		computed(() => useSyncStore().generation.has(id)),
}));
vi.mock("@/host", () => ({
	host: {
		database: {
			selectOne: vi.fn(async () => ({})),
			selectByField: vi.fn(async () => []),
			upsert: vi.fn(async () => {}),
			remove: vi.fn(async () => {}),
		},
		desktop: {
			window: {
				switchConversation: vi.fn(async () => true),
				releaseConversation: vi.fn(async () => {}),
			},
		},
	},
}));

function chat(role: string) {
	const sync = useSyncStore();
	const value = createConversationMeta({
		localPluginId: role,
		pluginVersionId: "v1",
	});
	let list = sync.conversationMeta.get(role);
	if (!list) sync.conversationMeta.set(role, (list = new Map()));
	list.set(value.id, value);
	return value.id;
}

async function visit(id: string) {
	await useUIStore().switch({ type: "conversation", id });
}

async function visitOtherRoles(count: number) {
	for (let i = 0; i < count; i++) await visit(chat(`other-${i}`));
}

beforeEach(() => {
	setActivePinia(createPinia());
	vi.clearAllMocks();
});

describe("role conversation LRU", () => {
	it("retains all chats of ten roles and unloads every chat of the oldest role on the eleventh", async () => {
		const sync = useSyncStore();
		const first = chat("first");
		const second = chat("first");
		await visit(first);
		await visit(second);
		await visitOtherRoles(9);
		expect(sync.containers.has(first)).toBe(true);
		expect(sync.containers.has(second)).toBe(true);
		await visit(chat("eleventh"));
		expect(sync.containers.has(first)).toBe(false);
		expect(sync.containers.has(second)).toBe(false);
		expect(sync.containers.size).toBe(10);
		expect(host.desktop?.window.releaseConversation).toHaveBeenCalledWith(
			first,
		);
		expect(host.desktop?.window.releaseConversation).toHaveBeenCalledWith(
			second,
		);
	});

	it("refreshes the role on revisit, including history navigation", async () => {
		const first = chat("first");
		const second = chat("second");
		await visit(first);
		await visit(second);
		await useUIStore().goBack();
		await visitOtherRoles(9);
		expect(useSyncStore().containers.has(first)).toBe(true);
		expect(useSyncStore().containers.has(second)).toBe(false);
	});

	it("does not unload on home navigation", async () => {
		const id = chat("first");
		await visit(id);
		await useUIStore().switch({ type: "home" });
		expect(useSyncStore().containers.has(id)).toBe(true);
		expect(host.desktop?.window.releaseConversation).not.toHaveBeenCalled();
	});

	it("reuses loaded chat containers on a cache hit", async () => {
		const id = chat("first");
		await visit(id);
		const containers = useSyncStore().containers.get(id);
		await visit(chat("second"));
		vi.mocked(host.database.selectByField).mockClear();
		await visit(id);
		expect(useSyncStore().containers.get(id)).toBe(containers);
		expect(host.database.selectByField).not.toHaveBeenCalled();
	});

	it("keeps dirty chats cached when eviction persistence fails and retries later", async () => {
		const sync = useSyncStore();
		const first = chat("first");
		await visit(first);
		await visitOtherRoles(9);
		const unload = vi
			.spyOn(sync, "unload")
			.mockRejectedValueOnce(new Error("write failed"));
		const latest = chat("eleventh");
		await visit(latest);
		expect(useUIStore().page).toEqual({ type: "conversation", id: latest });
		expect(sync.containers.has(first)).toBe(true);
		await visit(chat("eleventh"));
		expect(sync.containers.has(first)).toBe(false);
		unload.mockRestore();
	});

	it("waits for evicted chats to finish generating before unloading", async () => {
		const sync = useSyncStore();
		const id = chat("first");
		await visit(id);
		sync.generation.set(id, {});
		await visitOtherRoles(10);
		expect(sync.containers.has(id)).toBe(true);
		sync.generation.delete(id);
		await nextTick();
		await useUIStore().switch({ type: "home" });
		expect(sync.containers.has(id)).toBe(false);
	});

	it("cancels deferred eviction when the role is revisited", async () => {
		const sync = useSyncStore();
		const id = chat("first");
		await visit(id);
		sync.generation.set(id, {});
		await visitOtherRoles(10);
		await visit(id);
		sync.generation.delete(id);
		await nextTick();
		await useUIStore().switch({ type: "home" });
		expect(sync.containers.has(id)).toBe(true);
	});

	it("flushes and unloads a cached chat before handing it to another window", async () => {
		const sync = useSyncStore();
		const id = chat("first");
		await visit(id);
		await visit(chat("second"));
		sync.markDirty({ type: "meta", id });
		await useUIStore().openAtNewWindow(id);
		expect(host.database.upsert).toHaveBeenCalledWith(
			"conversations",
			id,
			expect.objectContaining({ id }),
		);
		expect(sync.containers.has(id)).toBe(false);
		expect(popOutTarget).toHaveBeenCalled();
	});
});
