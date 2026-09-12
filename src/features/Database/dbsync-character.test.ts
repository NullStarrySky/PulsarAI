import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

const { selectAll } = vi.hoisted(() => ({ selectAll: vi.fn() }));

vi.mock("./database-service", () => ({
	selectAll,
	selectByField: vi.fn(async () => []),
	selectOne: vi.fn(async () => null),
	upsert: vi.fn(async () => {}),
	remove: vi.fn(async () => {}),
}));

import { useSyncStore } from "./dbsync-store";

describe("character projection", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		selectAll.mockResolvedValue([
			{
				id: "local:role-1",
				value: {
					id: "local:role-1",
					tree: {
						"definition.package.json": JSON.stringify({ name: "旧名称" }),
						"avatar.png": "data:image/png;base64,avatar",
					},
					meta: {},
				},
			},
		]);
	});

	it("refreshes when Plugin source changes", async () => {
		const store = useSyncStore();
		await store.init();
		const character = [...store.characters][0]!;
		expect(character.avatarUrl).toBe("data:image/png;base64,avatar");

		store.plugins.get("role-1")!.tree["definition.package.json"] =
			JSON.stringify({ name: "新名称" });
		await nextTick();
		expect(character.name).toBe("新名称");
		store.clearAll();
	});
});
