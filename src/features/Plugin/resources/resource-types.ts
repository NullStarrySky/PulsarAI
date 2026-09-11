import {
	type FileMeta,
	type PluginResourceType,
	type ResourcePath,
	resourceType as resourceTypeForPath,
} from "../dataflow/types";

type PluginResourceValue = string | ArrayBuffer;

export interface ResourceFile extends FileMeta {
	path: ResourcePath;
	content: string;
}

export interface PluginResource {
	file: ResourceFile;
	type: PluginResourceType;
	read(): PluginResourceValue;
	import(environment: Record<string, unknown>): unknown | Promise<unknown>;
}

export function resourceType(file: ResourceFile): PluginResourceType {
	return resourceTypeForPath(file.path);
}

export function textContent(file: ResourceFile): string {
	return file.content;
}

export function binaryContent(file: ResourceFile): ArrayBuffer {
	return new TextEncoder().encode(file.content).buffer;
}
