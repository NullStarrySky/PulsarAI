import { beforeEach, describe, expect, it } from "vitest";
import { resetMockHostDatabase } from "@/features/Database/mock-database";
import { createWorldSelfApi } from "../runtime/self-api";
import { initializeWorlds, useWorld } from "../tree/world-store";

beforeEach(() => {
	resetMockHostDatabase();
});

async function setupOriginalWorld() {
	const localPluginId = crypto.randomUUID();
	await initializeWorlds(localPluginId);
	return { localPluginId, world: useWorld({ localPluginId, applyReplay: false }) };
}

describe("World self API path resolution", () => {
	it("resolves @/ and relative paths against the /self source root", async () => {
		const { localPluginId, world } = await setupOriginalWorld();

		await world.mkdir("/self/library");
		await world.write("/self/library/local.md", "local sibling");
		await world.write("/self/root.md", "Hi {{ name }}");

		const api = createWorldSelfApi("/self/library/entry.js", { localPluginId });
		// @/ anchors at the source root (/self), relatives at the resource folder.
		expect(api.read("@/root.md")).toBe("Hi {{ name }}");
		expect(api.read("local.md")).toBe("local sibling");
		expect(api.read("./local.md")).toBe("local sibling");
		expect(api.read("../root.md")).toBe("Hi {{ name }}");
		await expect(api.parse("@/root.md", { name: "Pulsar" })).resolves.toBe(
			"Hi Pulsar",
		);
	});

	it("resolves @/ against the owning global source, not /global at large", async () => {
		const { localPluginId, world } = await setupOriginalWorld();

		await world.mkdir("/global/mysource");
		await world.mkdir("/global/other-source");
		await world.write("/global/mysource/hero.md", "Hero");
		await world.write("/global/other-source/hero.md", "Not mine");

		const resource = world.resources.value.find(
			(item) => item.displayPath === "/global/mysource/hero.md",
		)!;
		const api = createWorldSelfApi(resource.path, { localPluginId });

		expect(api.read("@/hero.md")).toBe("Hero");
		expect(api.exists("@/hero.md")).toBe(true);
	});

	it("exposes slot membership through slot.paths and slot.import", async () => {
		const { localPluginId, world } = await setupOriginalWorld();

		await world.write("/self/doc.md", "Doc {{ n }}");
		const docPath = `/self/$${world.resolve("/self/doc.md").node.id}`;
		await world.assignResourceToSlot(docPath, "/self/slot/$document");

		const api = createWorldSelfApi("/self/entry.js", { localPluginId });
		expect(api.slot.paths("/self/slot/document")).toEqual([docPath]);
		await expect(
			api.slot.import("/self/slot/document", { n: 7 }),
		).resolves.toEqual(["Doc 7"]);
		await expect(
			api.parse([api.slot.paths("/self/slot/document")[0]!], { n: 8 }),
		).resolves.toEqual(["Doc 8"]);
	});
});
