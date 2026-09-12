import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sync } = vi.hoisted(() => ({
	sync: {
		chatMeta: new Map(),
		load: vi.fn(async () => {}),
		unload: vi.fn(async () => {}),
	},
}));

vi.mock("@/features/Database/dbsync-store", () => ({
	useSyncStore: () => sync,
}));

import { useTabsStore } from "./store";

describe("Tabs store", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		sync.chatMeta.clear();
		sync.load.mockClear();
		sync.unload.mockClear();
		vi.useFakeTimers();
	});
	afterEach(() => vi.useRealTimers());

	it("loads, reorders, activates, and unloads closed chats after a delay", async () => {
		const store = useTabsStore();
		await store.open({ type: "chat", contentid: "one" });
		await store.open({ type: "chat", contentid: "two" });
		expect(sync.load).toHaveBeenCalledTimes(2);
		store.reorder(1, 0);
		expect(store.tabs.map((tab) => tab.id)).toEqual(["two", "one"]);
		store.active(1);
		expect(store.activeId).toBe("one");
		store.close("one");
		expect(store.activeId).toBe("two");
		expect(sync.unload).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(300);
		expect(sync.unload).toHaveBeenCalledWith({ type: "chat", id: "one" });
	});
});
