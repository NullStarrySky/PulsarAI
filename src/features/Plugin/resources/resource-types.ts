import {
	type WorldFileNode,
	type WorldFileType,
	worldFileType,
} from "@/features/Plugin/tree/world-types";

export type PluginResourceType = WorldFileType;
type PluginResourceValue = string | ArrayBuffer;

export type ResourceFile = Pick<WorldFileNode, "name" | "content">;

export interface PluginResource {
	file: ResourceFile;
	type: PluginResourceType;
	read(): PluginResourceValue;
	import(environment: Record<string, unknown>): unknown | Promise<unknown>;
}

export function resourceType(file: ResourceFile): PluginResourceType {
	return worldFileType(file.name);
}

export function textContent(file: ResourceFile): string {
	if (typeof file.content === "string") return file.content;
	return JSON.stringify(file.content ?? null, null, 2);
}

export function binaryContent(file: ResourceFile): ArrayBuffer {
	const source = file.content;
	if (source instanceof ArrayBuffer) return source.slice(0);
	if (ArrayBuffer.isView(source)) {
		return source.buffer.slice(
			source.byteOffset,
			source.byteOffset + source.byteLength,
		);
	}
	// Persisted media currently keeps an URL/string payload.  Encoding preserves
	// the byte-oriented API until the database media backend supplies raw bytes.
	return new TextEncoder().encode(
		typeof source === "string" ? source : JSON.stringify(source ?? null),
	).buffer;
}
