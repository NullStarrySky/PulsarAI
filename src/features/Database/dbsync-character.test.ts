import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

const { selectAll, upsert } = vi.hoisted(() => ({
	selectAll: vi.fn(),
	upsert: vi.fn(async () => {}),
}));

vi.mock("./database-service", () => ({
	selectAll,
	selectByField: vi.fn(async () => []),
	selectOne: vi.fn(async () => null),
	upsert,
	remove: vi.fn(async () => {}),
}));

import { useCharacterList } from "@/features/Plugin/dataflow/use-plugin-data";
import { useSyncStore } from "./dbsync-store";

describe("character projection", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		upsert.mockClear();
		selectAll.mockResolvedValue([
			{
				id: "local:role-1",
				value: {
					id: "local:role-1",
					tree: {
						"definition.package.json": JSON.stringify({
							name: "旧名称",
							globalPlugins: ["core", "default"],
						}),
						"avatar.png": "data:image/png;base64,avatar",
					},
					meta: {},
				},
			},
		]);
	});

	it("creates a local Plugin and exposes its role projection", async () => {
		const store = useSyncStore();
		await store.init();
		const list = useCharacterList();

		const character = await list.create();

		expect(character.name).toBe("新角色");
		expect(store.plugins.get(character.id)?.id).toBe(`local:${character.id}`);
		expect(upsert).toHaveBeenCalledWith(
			"resource_worlds",
			`local:${character.id}`,
			expect.objectContaining({ id: `local:${character.id}` }),
		);
		store.clearAll();
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
