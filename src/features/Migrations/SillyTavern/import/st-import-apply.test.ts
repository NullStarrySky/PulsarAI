import { describe, expect, it } from "vitest";
import { applyStImportPlan, type StImportWorldWriter } from "./st-import-apply";
import type { StImportPlan } from "./st-import-plan";

function createMockWriter(): {
	writer: StImportWorldWriter;
	files: Map<string, { content: unknown; slot?: string; condition?: string; priority?: number; selected?: boolean }>;
	folders: Set<string>;
} {
	const files = new Map<string, { content: unknown; slot?: string; condition?: string; priority?: number; selected?: boolean }>();
	const folders = new Set<string>(["/self", "/self/localSlot"]);

	const writer: StImportWorldWriter = {
		exists(path: string) {
			return folders.has(path) || files.has(path);
		},
		ls(path = "/") {
			const result: Array<{ id: string; name: string; type: "file" | "folder" }> = [];
			for (const folder of folders) {
				if (folder !== path && folder.startsWith(path)) {
					const rest = folder.slice(path.length).replace(/^\//, "");
					if (!rest.includes("/")) {
						result.push({ id: rest, name: rest, type: "folder" });
					}
				}
			}
			for (const file of files.keys()) {
				if (file.startsWith(path)) {
					const rest = file.slice(path.length).replace(/^\//, "");
					if (!rest.includes("/")) {
						result.push({ id: rest, name: rest, type: "file" });
					}
				}
			}
			return result;
		},
		async createFolder(parentPath: string, name: string) {
			const full = `${parentPath}/${name}`;
			folders.add(full);
			return full;
		},
		async createFile(parentPath: string, name: string, content?: unknown) {
			const full = `${parentPath}/${name}`;
			files.set(full, { content });
			return full;
		},
		async updateFolder(_path: string, _patch: { parent?: string }) {},
		async updateFile(path: string, patch: { slot?: string; condition?: string; priority?: number; resourceSelected?: boolean }) {
			const file = files.get(path);
			if (file) {
				if (patch.slot !== undefined) file.slot = patch.slot;
				if (patch.condition !== undefined) file.condition = patch.condition;
				if (patch.priority !== undefined) file.priority = patch.priority;
				if (patch.resourceSelected !== undefined) file.selected = patch.resourceSelected;
			}
		},
		async setSelected(path: string, selected: boolean) {
			const file = files.get(path);
			if (file) file.selected = selected;
		},
	};

	return { writer, files, folders };
}

describe("applyStImportPlan", () => {
	it("applies a folder-mode plan into /self", async () => {
		const { writer, files, folders } = createMockWriter();
		const plan: StImportPlan = {
			kind: "character",
			name: "hero",
			mode: "folder",
			files: [
				{
					path: "info.md",
					content: "# Hero Info",
					slotId: "character",
				},
				{
					path: "lorebooks/001-secret.md",
					content: "Secret lore",
					slotId: "depth:2",
					condition: "include(chat, 'secret')",
					priority: 50,
					resourceSelected: true,
				},
			],
			diagnostics: [],
		};

		const result = await applyStImportPlan(writer, plan, "/self");
		expect(result.rootPath).toBe("/self/hero");
		expect(folders.has("/self/hero")).toBe(true);
		expect(files.has("/self/hero/info.md")).toBe(true);
		expect(files.has("/self/hero/lorebooks/001-secret.md")).toBe(true);

		const info = files.get("/self/hero/info.md");
		expect(info?.content).toBe("# Hero Info");
		expect(info?.slot).toContain("character");
		expect(info?.selected).toBe(true);

		const lore = files.get("/self/hero/lorebooks/001-secret.md");
		expect(lore?.slot).toContain("depth:2");
		expect(lore?.condition).toBe("include(chat, 'secret')");
		expect(lore?.priority).toBe(50);
		expect(lore?.selected).toBe(true);
	});

	it("applies a single file plan", async () => {
		const { writer, files } = createMockWriter();
		const plan: StImportPlan = {
			kind: "regex",
			name: "my-rules",
			mode: "file",
			files: [
				{
					path: "regex.json",
					content: [{ findRegex: "a", replaceString: "b" }],
					slotId: "REGEX",
				},
			],
			diagnostics: [],
		};

		const result = await applyStImportPlan(writer, plan, "/self");
		expect(result.rootPath).toBe("/self/regex.json");
		expect(files.has("/self/regex.json")).toBe(true);
		const regexFile = files.get("/self/regex.json");
		expect(regexFile?.slot).toContain("REGEX");
	});
});
