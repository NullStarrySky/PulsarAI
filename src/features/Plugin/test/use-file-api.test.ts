import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { shallowRef } from "vue";
import { executeCodeAct } from "../agent/runtime/code-act";
import { applyPulse } from "../dataflow/pulse";
import type { PluginData, Pulse } from "../dataflow/types";
import { useFileApi } from "../dataflow/use-file-api";

function createFileApi() {
	const data = shallowRef<PluginData>({
		id: "test",
		tree: {
			"a.txt": "one one\nTODO\nthird",
			folder: {
				"guide.md": "TODO first\nnext TODO",
				nested: { "note.md": "note" },
			},
		},
		meta: {},
	});
	const pulses: Pulse[] = [];
	const files = useFileApi({
		filetree: data,
		applyPulse(pulse) {
			applyPulse(data.value, pulse);
			pulses.push(pulse);
		},
	});
	return { data, files, pulses };
}

describe("useFileApi", () => {
	it("lists addressable entries and reports detached resource metadata", () => {
		const { files } = createFileApi();
		expect(files.list()).toEqual({
			entries: [
				{ path: "/a.txt", name: "a.txt", kind: "file" },
				{ path: "/folder", name: "folder", kind: "folder" },
			],
			truncated: false,
		});
		expect(files.stat("/a.txt")).toMatchObject({
			path: "/a.txt",
			kind: "file",
			meta: null,
		});
	});

	it("bounds recursive resource and content queries", () => {
		const { files } = createFileApi();
		expect(files.list("/", { limit: 1 })).toEqual({
			entries: [{ path: "/a.txt", name: "a.txt", kind: "file" }],
			truncated: true,
		});
		expect(files.find("/", { name: ".md", kind: "file" })).toEqual({
			entries: [
				{ path: "/folder/guide.md", name: "guide.md", kind: "file" },
				{
					path: "/folder/nested/note.md",
					name: "note.md",
					kind: "file",
				},
			],
			truncated: false,
		});
		expect(files.search("TODO", "/folder", { context: 1, limit: 1 })).toEqual({
			matches: [
				{
					path: "/folder/guide.md",
					line: 1,
					text: "TODO first",
					before: [],
					after: ["next TODO"],
				},
			],
			truncated: true,
			nextOffset: 1,
		});
		expect(files.readLines("/a.txt", { endLine: 2, limit: 1 })).toEqual({
			lines: [{ line: 1, text: "one one" }],
			truncated: true,
		});
	});

	it("projects a bounded nested tree and supports paged, filtered searches", () => {
		const { files } = createFileApi();
		expect(files.tree("/folder", { maxDepth: 1 })).toEqual({
			entries: [
				{ path: "/folder/guide.md", name: "guide.md", kind: "file" },
				{ path: "/folder/nested", name: "nested", kind: "folder" },
			],
			truncated: false,
		});
		expect(
			files.search("todo", "/folder", {
				caseSensitive: false,
				extensions: [".md"],
				limit: 1,
			}),
		).toMatchObject({
			matches: [{ path: "/folder/guide.md", line: 1 }],
			truncated: true,
			nextOffset: 1,
		});
		expect(
			files.search("^next", "/folder", { regex: true, offset: 1 }),
		).toEqual({ matches: [], truncated: false, nextOffset: null });
		expect(() => files.search("[", "/", { regex: true })).toThrow("无效的搜索正则");
	});

	it("replaces all verified literal matches without recording a failed edit", () => {
		const { files, pulses } = createFileApi();
		expect(
			files.edit("/a.txt", "one", "two", { all: true, expectedMatches: 2 }),
		).toEqual({ matches: 2 });
		expect(files.read("/a.txt")).toMatch(/^two two/);
		const count = pulses.length;
		expect(() =>
			files.edit("/a.txt", "TODO", "done", { expectedMatches: 2 }),
		).toThrow("待替换文本匹配数不符");
		expect(pulses).toHaveLength(count);
	});

	it("makes creation, overwrite, and deletion policies explicit", () => {
		const { files, pulses } = createFileApi();
		expect(() => files.write("/a.txt", "new", { overwrite: false })).toThrow(
			"目标路径已存在",
		);
		expect(() =>
			files.write("/missing/file.txt", "new", { parents: false }),
		).toThrow("目标父目录不存在");
		expect(pulses).toEqual([]);

		files.write("/target.txt", "target");
		files.move("/a.txt", "/target.txt", { overwrite: true });
		expect(files.read("/target.txt")).toContain("one one");
		expect(files.exists("/a.txt")).toBe(false);
		expect(() => files.copy("/folder", "/folder/copy")).toThrow(
			"不能相同、互为父子级",
		);
		files.remove("/missing", { missingOk: true });
		expect(() => files.mkdir("/folder")).not.toThrow();
		expect(() => files.mkdir("/folder", { existOk: false })).toThrow(
			"目标路径已存在",
		);
	});

	it("writes replacement text literally", () => {
		const { files } = createFileApi();
		files.edit("/a.txt", "TODO", "$&");
		expect(files.read("/a.txt")).toContain("$&");
	});

	it("adds append, touch, and empty-directory deletion", () => {
		const { files } = createFileApi();
		files.touch("/generated/empty.txt");
		files.append("/generated/empty.txt", "content");
		expect(files.read("/generated/empty.txt")).toBe("content");
		files.mkdir("/empty");
		files.rmdir("/empty");
		expect(files.exists("/empty")).toBe(false);
		expect(() => files.rmdir("/folder")).toThrow("文件夹不为空");
	});

	it("round-trips UTF-8 World files through ZIP and rejects unsafe archives", () => {
		const { files } = createFileApi();
		const archive = files.zip("/folder");
		expect(archive).toEqual(expect.any(Array));
		expect(files.unzip(archive, "/restored")).toEqual({ files: 2 });
		expect(files.read("/restored/guide.md")).toBe("TODO first\nnext TODO");
		expect(files.read("/restored/nested/note.md")).toBe("note");
		files.transaction(() => {
			expect(() => files.unzip([1, 2, 3], "/failed")).toThrow("无法解压 ZIP");
		});
		expect(files.exists("/failed")).toBe(false);
		expect(() =>
			files.unzip(
				Array.from(zipSync({ "../escaped.txt": strToU8("no") })),
				"/unsafe",
			),
		).toThrow("ZIP 包含无效路径");
		expect(files.exists("/unsafe")).toBe(false);
	});

	it("does not retain a failed batch inside a caught transaction", () => {
		const { files, pulses } = createFileApi();
		files.transaction(() => {
			try {
				files.move("/missing", "/created/file.txt");
			} catch {}
			expect(files.exists("/created")).toBe(false);
		});
		expect(files.exists("/created")).toBe(false);
		expect(pulses).toEqual([]);
	});

	it("does not hide invalid paths or record failed mutations", () => {
		const { files, pulses } = createFileApi();
		expect(() => files.exists("invalid")).toThrow("资源路径必须以 / 开头");
		expect(() => files.move("/missing", "/created/file.txt")).toThrow(
			"资源不存在：/missing",
		);
		expect(files.exists("/created")).toBe(false);
		expect(pulses).toEqual([]);
	});

	it("rolls back all World changes when codeAct throws", async () => {
		const { files, pulses } = createFileApi();
		const result = await executeCodeAct(
			"async function () { write('/new.txt', 'new'); throw new Error('stop'); return null; }",
			{
				write: files.write,
				__runCodeActTransaction: files.transaction,
			},
		);
		expect(result).toMatchObject({
			ok: false,
			error: expect.stringContaining("stop"),
		});
		expect(files.exists("/new.txt")).toBe(false);
		expect(pulses).toEqual([]);
	});

	it("commits a successful codeAct transaction after its reads see staged writes", async () => {
		const { files, pulses } = createFileApi();
		const result = await executeCodeAct(
			"async function () { write('/new.txt', 'new'); return read('/new.txt'); }",
			{
				read: files.read,
				write: files.write,
				__runCodeActTransaction: files.transaction,
			},
		);
		expect(result).toEqual({ ok: true, value: "new" });
		expect(files.read("/new.txt")).toBe("new");
		expect(pulses).toEqual([
			{ kind: "file.write", path: "/new.txt", content: "new" },
		]);
	});
});
