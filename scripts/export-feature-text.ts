// 以防你想试试把所有文件一股脑塞进模型上下文是什么感觉，哈哈

import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = join(import.meta.dirname, "..", "src", "features");
const output = join(import.meta.dirname, "..", "output.md");
const textExtensions = new Set([
	".css",
	".cjs",
	".html",
	".js",
	".json",
	".md",
	".mjs",
	".ts",
	".tsx",
	".txt",
	".vue",
	".yaml",
	".yml",
]);

async function collect(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const result: string[] = [];
	for (const entry of entries.sort((left, right) =>
		left.name.localeCompare(right.name),
	)) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) result.push(...(await collect(path)));
		else if (entry.isFile() && textExtensions.has(extname(entry.name)))
			result.push(path);
	}
	return result;
}

const files = await collect(root);
const sections = await Promise.all(
	files.map(async (path) => {
		const source = await readFile(path, "utf8");
		return `\n\n${relative(join(import.meta.dirname, ".."), path).replaceAll("\\", "/")}\n\n${source}`;
	}),
);
await writeFile(output, sections.join(""), "utf8");
console.log(`Wrote ${files.length} files to ${output}`);
