import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const roots = ["src", "host", "scripts"];
const extensions = new Set([".ts", ".tsx", ".vue", ".js", ".mjs", ".cjs", ".rs", ".css", ".json"]);
const ignoredDirectories = new Set([".git", "node_modules", "dist", "target", "coverage", ".vite"]);

type Counts = {
	files: number;
	lines: number;
	nonBlank: number;
	blank: number;
};

const counts = new Map<string, Counts>();

function addFile(path: string) {
	const extension = extname(path) || "[no extension]";
	if (!extensions.has(extension)) return;

	const lines = readFileSync(path, "utf8").split(/\r?\n/);
	const blank = lines.filter((line) => line.trim().length === 0).length;
	const current = counts.get(extension) ?? { files: 0, lines: 0, nonBlank: 0, blank: 0 };

	current.files += 1;
	current.lines += lines.length;
	current.nonBlank += lines.length - blank;
	current.blank += blank;
	counts.set(extension, current);
}

function walk(directory: string) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!ignoredDirectories.has(entry.name)) walk(path);
		} else if (entry.isFile()) {
			addFile(path);
		}
	}
}

for (const root of roots) walk(root);

const total = { files: 0, lines: 0, nonBlank: 0, blank: 0 };
const rows = [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));

console.table(
	rows.map(([extension, count]) => {
		total.files += count.files;
		total.lines += count.lines;
		total.nonBlank += count.nonBlank;
		total.blank += count.blank;
		return { extension, ...count };
	}),
);
console.table([{ extension: "total", ...total }]);
