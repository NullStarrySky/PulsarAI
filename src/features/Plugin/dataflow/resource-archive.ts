import { strToU8, unzipSync, zipSync } from "fflate";
import { normalizeResourcePath, resolveNode } from "./pulse";
import type { PluginData, ResourcePath } from "./types";

function archivePath(path: string) {
	if (
		!path ||
		path.startsWith("/") ||
		path.includes("\\") ||
		path.includes("\0")
	)
		throw new Error(`ZIP 包含无效路径：${path}`);
	const parts = path.split("/");
	if (parts.some((part) => !part || part === "." || part === ".."))
		throw new Error(`ZIP 包含无效路径：${path}`);
	return parts.join("/");
}

/** Compresses text resources under one World path. Directories themselves are implicit. */
export function zipResources(data: PluginData, path: ResourcePath = "/") {
	const resolved = resolveNode(data.tree, path);
	const files: Record<string, Uint8Array> = {};
	const visit = (node: typeof resolved.node, relative: string) => {
		if (typeof node === "string") {
			files[archivePath(relative)] = strToU8(node);
			return;
		}
		for (const [name, child] of Object.entries(node))
			visit(child, relative ? `${relative}/${name}` : name);
	};
	if (typeof resolved.node === "string")
		visit(resolved.node, resolved.name ?? "resource");
	else visit(resolved.node, "");
	return Array.from(zipSync(files, { level: 6 }));
}

export type UnzippedResource = { path: ResourcePath; content: string };

/** Decodes a ZIP as UTF-8 text files suitable for the current World model. */
export function unzipResources(
	input: Uint8Array | number[],
): UnzippedResource[] {
	const bytes = input instanceof Uint8Array ? input : Uint8Array.from(input);
	let entries: Record<string, Uint8Array>;
	try {
		entries = unzipSync(bytes);
	} catch (error) {
		throw new Error(
			`无法解压 ZIP：${error instanceof Error ? error.message : String(error)}`,
		);
	}
	const decoder = new TextDecoder("utf-8", { fatal: true });
	return Object.entries(entries)
		.filter(([name]) => !name.endsWith("/"))
		.map(([name, value]) => {
			const relative = archivePath(name);
			try {
				return {
					path: normalizeResourcePath(`/${relative}`),
					content: decoder.decode(value),
				};
			} catch {
				throw new Error(`ZIP 文件不是 UTF-8 文本：${name}`);
			}
		})
		.sort((left, right) => left.path.localeCompare(right.path));
}
