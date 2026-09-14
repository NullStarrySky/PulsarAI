import { describe, expect, it } from "vitest";
import {
	applyStImportPlan,
	type StImportWorldWriter,
} from "@/features/Migrations/SillyTavern/import/st-import-apply";
import type { StImportPlan } from "@/features/Migrations/SillyTavern/import/st-import-plan";

function createMockWriter() {
	const files = new Map<
		string,
		{
			content: string;
			slot?: string;
			condition?: string;
			priority?: number;
			selected?: boolean;
		}
	>();
	const folders = new Set<string>(["/", "/localSlot"]);
	const writer: StImportWorldWriter = {
		exists: (path) => folders.has(path) || files.has(path),
		ls: (path = "/") =>
			[...folders, ...files.keys()]
				.filter((item) => item !== path && item.startsWith(path))
				.map((item) => item.slice(path.length).replace(/^\//, ""))
				.filter((item) => item && !item.includes("/")),
		mkdir: (path) => void folders.add(path),
		write: (path, content) => void files.set(path, { content }),
		updateFolderMeta: () => {},
		updateFileMeta(path, patch) {
			const file = files.get(path);
			if (!file) return;
			if (patch.slot !== undefined) file.slot = patch.slot;
			if (patch.condition !== undefined) file.condition = patch.condition;
			if (patch.priority !== undefined) file.priority = patch.priority;
			if (patch.resourceSelected !== undefined)
				file.selected = patch.resourceSelected;
		},
	};
	return { writer, files, folders };
}

describe("applyStImportPlan", () => {
	it("applies a folder plan into the local source", async () => {
		const { writer, files, folders } = createMockWriter();
		const plan: StImportPlan = {
			kind: "character",
			name: "hero",
			mode: "folder",
			files: [
				{ path: "info.md", content: "# Hero", slotId: "character" },
				{
					path: "lorebooks/001-secret.md",
					content: "Secret lore",
					slotId: "depth:2",
					condition: "include(chat, 'secret')",
					priority: 50,
				},
			],
			diagnostics: [],
		};
		const result = await applyStImportPlan(writer, plan, "/");
		expect(result.rootPath).toBe("/hero");
		expect(folders.has("/hero/lorebooks")).toBe(true);
		expect(files.get("/hero/info.md")?.slot).toContain("character");
		expect(files.get("/hero/lorebooks/001-secret.md")?.priority).toBe(50);
	});

	it("applies a single JSON file as authored text", async () => {
		const { writer, files } = createMockWriter();
		const plan: StImportPlan = {
			kind: "regex",
			name: "rules",
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
		await applyStImportPlan(writer, plan, "/");
		expect(files.get("/regex.json")?.content).toContain("findRegex");
	});
});
