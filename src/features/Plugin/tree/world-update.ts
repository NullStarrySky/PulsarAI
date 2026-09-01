import { toRaw } from "vue";
import type { WorldDocument } from "./world-types";

export const worldNone = { type: "none" } as const;

type WorldUpdateValue =
	| typeof worldNone
	| { type: "replace"; find: string; replace: string }
	| { type: "value"; value: unknown };

/** A path is a stable JSON path below the complete World root. */
export interface WorldUpdate {
	scope: "global" | "self";
	path: string[];
	value: WorldUpdateValue;
}

export interface WorldJsonPatch {
	op: "add" | "replace" | "remove";
	path: string;
	value?: unknown;
}

function clone<T>(value: T): T {
	return structuredClone(toRaw(value));
}

function isContainer(
	value: unknown,
): value is Record<string, unknown> | unknown[] {
	return Boolean(value && typeof value === "object");
}

function parentAt(root: unknown, path: string[]) {
	if (!path.length) throw new Error("World update 路径不能为空。");
	let current = root as Record<string, unknown> | unknown[];
	for (const part of path.slice(0, -1)) {
		const next = Array.isArray(current) ? current[Number(part)] : current[part];
		if (!isContainer(next))
			throw new Error(`World update 路径不存在：/${path.join("/")}`);
		current = next;
	}
	return { parent: current, key: path[path.length - 1]! };
}

function valueAt(root: unknown, path: string[]) {
	let current = root as unknown;
	for (const part of path) {
		if (!isContainer(current)) return undefined;
		current = Array.isArray(current) ? current[Number(part)] : current[part];
	}
	return current;
}

function escapedPointer(path: string[]) {
	return `/${path.map((part) => part.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`;
}

export function applyWorldUpdate(
	world: WorldDocument,
	update: WorldUpdate,
): WorldDocument {
	const { parent, key } = parentAt(world, update.path);
	if (update.value.type === "none") {
		if (Array.isArray(parent)) parent.splice(Number(key), 1);
		else delete parent[key];
		return world;
	}
	if (update.value.type === "replace") {
		const source = valueAt(world, update.path);
		if (typeof source !== "string" || !source.includes(update.value.find))
			throw new Error(`World 文本替换失败：/${update.path.join("/")}`);
		const next = source.replace(update.value.find, update.value.replace);
		if (Array.isArray(parent)) parent[Number(key)] = next;
		else parent[key] = next;
		return world;
	}
	if (Array.isArray(parent)) parent[Number(key)] = clone(update.value.value);
	else parent[key] = clone(update.value.value);
	return world;
}

/** Converts one World update into the SurrealDB JSON patch for `record.value`. */
export function worldUpdatePatch(
	documentPath: string[],
	update: WorldUpdate,
	current: unknown,
): WorldJsonPatch {
	const path = [...documentPath, ...update.path];
	if (update.value.type === "none")
		return { op: "remove", path: escapedPointer(path) };
	if (update.value.type === "replace") {
		if (typeof current !== "string" || !current.includes(update.value.find))
			throw new Error(`World 文本替换失败：/${update.path.join("/")}`);
		return {
			op: "replace",
			path: escapedPointer(path),
			value: current.replace(update.value.find, update.value.replace),
		};
	}
	return {
		op:
			valueAt({ value: current }, ["value"]) === undefined ? "add" : "replace",
		path: escapedPointer(path),
		value: clone(update.value.value),
	};
}
