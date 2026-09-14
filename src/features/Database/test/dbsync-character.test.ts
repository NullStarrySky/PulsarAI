import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick } from "vue";
import { usePluginVersion } from "@/features/Plugin/dataflow/plugin-version";

const { selectAll, upsert } = vi.hoisted(() => ({
	selectAll: vi.fn(),
	upsert: vi.fn(async () => {}),
}));

vi.mock("../database-service", () => ({
	selectAll,
	selectByField: vi.fn(async () => []),
	selectOne: vi.fn(async () => null),
	upsert,
	remove: vi.fn(async () => {}),
}));

import { useCharacterList } from "@/features/Plugin/dataflow/use-plugin-data";
import { useSyncStore } from "../dbsync-store";

describe("character projection", () => {
	let scope: ReturnType<typeof effectScope>;
	beforeEach(() => {
		scope = effectScope();
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
					versions: [
						{
							id: "base",
							parentId: null,
							createdAt: "2026-01-01T00:00:00.000Z",
							pulses: [],
						},
					],
				},
			},
		]);
	});
	afterEach(() => {
		scope.stop();
		useSyncStore().clearAll();
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

	it("refreshes when the editable Plugin version changes", async () => {
		const store = useSyncStore();
		await store.init();
		const character = [...store.characters][0]!;
		const version = scope.run(() => usePluginVersion("role-1"))!;
		expect(character.avatarUrl).toBe("data:image/png;base64,avatar");

		version.value!.pulses.push({
			kind: "file.write",
			path: "/definition.package.json",
			content: JSON.stringify({ name: "新名称" }),
		});
		await nextTick();
		expect(character.name).toBe("新名称");
		store.clearAll();
	});

	it("marks scoped version mutations dirty and stops on disposal", async () => {
		const store = useSyncStore();
		await store.init();
		await store._sync();
		upsert.mockClear();
		const version = scope.run(() => usePluginVersion("role-1"))!;
		version.value!.pulses.push({
			kind: "file.write",
			path: "/x.md",
			content: "x",
		});
		await store._sync();
		expect(upsert).toHaveBeenCalledWith(
			"resource_worlds",
			"local:role-1",
			expect.anything(),
		);
		upsert.mockClear();
		scope.stop();
		version.value!.pulses.push({
			kind: "file.write",
			path: "/x.md",
			content: "after",
		});
		await store._sync();
		expect(upsert).not.toHaveBeenCalled();
	});
});
