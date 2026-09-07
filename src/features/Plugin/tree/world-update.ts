import { toRaw } from "vue";
import type { World, WorldDocument, WorldFileNode, WorldFolderNode, WorldNode } from "./world-types";

export type WorldScopeName = "global" | "self";
export interface WorldNodeRef { scope: WorldScopeName; id: string }

type FileMeta = Pick<WorldFileNode, "name" | "icon" | "description" | "treeOrder" | "resourceSelected" | "slot" | "priority" | "condition" | "conditionEnabled" | "updateDate">;
type FolderMeta = Pick<WorldFolderNode, "name" | "icon" | "description" | "treeOrder" | "openIcon" | "selectionMode" | "allowedResourceTypes" | "parent" | "updateDate">;

/** One replayable, ID-addressed change. filename/nameAtTime are display-only history. */
export type PulseOperation =
	| { kind: "file.write"; scope: WorldScopeName; nodeId: string; content: unknown; filename?: string }
	| { kind: "file.replace"; scope: WorldScopeName; nodeId: string; find: string; replace: string; filename?: string }
	| { kind: "file.meta.patch"; scope: WorldScopeName; nodeId: string; patch: Partial<FileMeta>; filename?: string }
	| { kind: "folder.meta.patch"; scope: WorldScopeName; nodeId: string; patch: Partial<FolderMeta>; filename?: string }
	| { kind: "node.create"; scope: WorldScopeName; parentId: string; node: WorldNode; parentNameAtTime?: string }
	| { kind: "node.delete"; scope: WorldScopeName; nodeId: string; parentId: string; nameAtTime: string }
	| { kind: "node.move"; scope: WorldScopeName; nodeId: string; parentId: string; targetParentId: string; nameAtTime: string; patch?: Pick<FileMeta | FolderMeta, "name" | "treeOrder" | "updateDate"> }
	| { kind: "node.copy"; scope: WorldScopeName; source: WorldNodeRef; targetParentId: string; idMap: Record<string, string>; nameAtTime: string; patch?: Pick<FileMeta | FolderMeta, "name" | "treeOrder" | "updateDate"> };

/** A user-visible atomic change. Cascading metadata lives in this same Pulse. */
export interface Pulse { id: string; createdAt: string; operations: PulseOperation[] }
export interface WorldJsonPatch { op: "add" | "replace" | "remove"; path: string; value?: unknown }

type WorldNodeLocation = { node: WorldNode; parent: WorldFolderNode | null; path: string[]; ancestors: Set<string> };
export type WorldNodeIndex = Map<string, WorldNodeLocation>;
export type WorldIndexes = Record<WorldScopeName, WorldNodeIndex>;

function clone<T>(value: T): T { return structuredClone(toRaw(value)); }
export function createPulse(operations: PulseOperation[]): Pulse {
	if (!operations.length) throw new Error("Pulse 不能为空。");
	return { id: crypto.randomUUID(), createdAt: new Date().toISOString(), operations };
}
export function describePulse(pulse: Pulse): string {
	const first = pulse.operations[0];
	if (!first) return "修改资源";
	const name = "filename" in first ? first.filename : "nameAtTime" in first ? first.nameAtTime : first.kind === "node.create" ? first.node.name : undefined;
	const suffix = pulse.operations.length > 1 ? `（及 ${pulse.operations.length - 1} 项关联修改）` : "";
	switch (first.kind) {
		case "file.write": return `写入 ${name ?? "文件"}${suffix}`;
		case "file.replace": return `替换 ${name ?? "文件"} 中的文本${suffix}`;
		case "file.meta.patch": case "folder.meta.patch": return `更新 ${name ?? "资源"} 属性${suffix}`;
		case "node.create": return `新建 ${name}${suffix}`;
		case "node.delete": return `删除 ${name}${suffix}`;
		case "node.move": return `移动 ${name}${suffix}`;
		case "node.copy": return `复制 ${name}${suffix}`;
	}
}

export function createWorldNodeIndex(document: WorldDocument): WorldNodeIndex {
	const index: WorldNodeIndex = new Map();
	const visit = (node: WorldNode, parent: WorldFolderNode | null, path: string[], ancestors: Set<string>) => {
		if (index.has(node.id)) throw new Error(`World 节点 ID 重复：${node.id}`);
		index.set(node.id, { node, parent, path, ancestors });
		if (node.type === "folder") { const next = new Set(ancestors).add(node.id); for (const child of Object.values(node.children)) visit(child, node, [...path, "children", child.id], next); }
	};
	visit(document.root, null, ["root"], new Set()); return index;
}
export function createWorldIndexes(world: World): WorldIndexes { return { global: createWorldNodeIndex(world.global), self: createWorldNodeIndex(world.self) }; }

function assertMeta(patch: Record<string, unknown>, allowed: string[], kind: string) {
	for (const key of Object.keys(patch)) if (!allowed.includes(key)) throw new Error(`不允许修改${kind}元数据：${key}`);
}
function nodeAt(indexes: WorldIndexes, scope: WorldScopeName, nodeId: string) { const target = indexes[scope].get(nodeId); if (!target) throw new Error(`World 节点不存在：$${nodeId}`); return target; }
function copyNode(node: WorldNode, idMap: Record<string, string>): WorldNode {
	const id = idMap[node.id]; if (!id) throw new Error(`复制缺少节点 ID 映射：${node.id}`);
	if (node.type === "file") return { ...clone(node), id };
	const children = Object.fromEntries(Object.values(node.children).map(child => { const copied = copyNode(child, idMap); return [copied.id, copied]; }));
	return { ...clone(node), id, children };
}
function checkPatch(node: WorldNode, patch: object) {
	assertMeta(patch as Record<string, unknown>, node.type === "file" ? ["name", "icon", "description", "treeOrder", "resourceSelected", "slot", "priority", "condition", "conditionEnabled", "updateDate"] : ["name", "icon", "description", "treeOrder", "openIcon", "selectionMode", "allowedResourceTypes", "parent", "updateDate"], node.type === "file" ? "文件" : "文件夹");
}
function applyOperation(world: World, operation: PulseOperation, indexes: WorldIndexes) {
	switch (operation.kind) {
		case "file.write": { const target = nodeAt(indexes, operation.scope, operation.nodeId); if (target.node.type !== "file") throw new Error("file.write 目标不是文件。"); target.node.content = clone(operation.content); break; }
		case "file.replace": { const target = nodeAt(indexes, operation.scope, operation.nodeId); if (target.node.type !== "file" || typeof target.node.content !== "string" || !target.node.content.includes(operation.find)) throw new Error("World 文本替换失败。"); target.node.content = target.node.content.replace(operation.find, operation.replace); break; }
		case "file.meta.patch": { const target = nodeAt(indexes, operation.scope, operation.nodeId); if (target.node.type !== "file") throw new Error("file.meta.patch 目标不是文件。"); checkPatch(target.node, operation.patch); Object.assign(target.node, clone(operation.patch)); break; }
		case "folder.meta.patch": { const target = nodeAt(indexes, operation.scope, operation.nodeId); if (target.node.type !== "folder") throw new Error("folder.meta.patch 目标不是文件夹。"); checkPatch(target.node, operation.patch); Object.assign(target.node, clone(operation.patch)); break; }
		case "node.create": { const parent = nodeAt(indexes, operation.scope, operation.parentId); if (parent.node.type !== "folder") throw new Error("node.create 父节点不是文件夹。"); if (indexes[operation.scope].has(operation.node.id)) throw new Error(`World 节点 ID 已存在：${operation.node.id}`); parent.node.children[operation.node.id] = clone(operation.node); indexes[operation.scope] = createWorldNodeIndex(world[operation.scope]); break; }
		case "node.delete": { const target = nodeAt(indexes, operation.scope, operation.nodeId); if (!target.parent || target.parent.id !== operation.parentId) throw new Error("node.delete 父节点不匹配。"); delete target.parent.children[target.node.id]; indexes[operation.scope] = createWorldNodeIndex(world[operation.scope]); break; }
		case "node.move": { const source = nodeAt(indexes, operation.scope, operation.nodeId); const target = nodeAt(indexes, operation.scope, operation.targetParentId); if (!source.parent || source.parent.id !== operation.parentId || target.node.type !== "folder" || target.ancestors.has(source.node.id) || target.node.id === source.node.id) throw new Error("不能将文件夹移动到自身或其子级。"); checkPatch(source.node, operation.patch ?? {}); delete source.parent.children[source.node.id]; target.node.children[source.node.id] = source.node; Object.assign(source.node, clone(operation.patch ?? {})); indexes[operation.scope] = createWorldNodeIndex(world[operation.scope]); break; }
		case "node.copy": { const source = nodeAt(indexes, operation.source.scope, operation.source.id); const target = nodeAt(indexes, operation.scope, operation.targetParentId); if (target.node.type !== "folder") throw new Error("node.copy 目标不是文件夹。"); const copied = copyNode(source.node, operation.idMap); if (indexes[operation.scope].has(copied.id)) throw new Error(`World 节点 ID 已存在：${copied.id}`); checkPatch(copied, operation.patch ?? {}); Object.assign(copied, clone(operation.patch ?? {})); target.node.children[copied.id] = copied; indexes[operation.scope] = createWorldNodeIndex(world[operation.scope]); break; }
	}
}
export function applyPulse(world: World, pulse: Pulse, indexes = createWorldIndexes(world)): World { for (const operation of pulse.operations) applyOperation(world, operation, indexes); return world; }
export function applyPulses(world: World, pulses: Pulse[]): World { const indexes = createWorldIndexes(world); for (const pulse of pulses) applyPulse(world, pulse, indexes); return world; }

function escapedPointer(path: string[]) { return `/${path.map(part => part.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`; }
function pathFor(document: WorldDocument, nodeId: string) { const location = createWorldNodeIndex(document).get(nodeId); if (!location) throw new Error(`World 节点不存在：$${nodeId}`); return location.path; }
/** JSON patches are derived from the same Pulse; JSON Patch is never the replay contract. */
export function pulseJsonPatches(world: World, pulse: Pulse): Record<WorldScopeName, WorldJsonPatch[]> {
	const working = clone(world); const output: Record<WorldScopeName, WorldJsonPatch[]> = { global: [], self: [] };
	for (const op of pulse.operations) {
		const before = clone(working); applyOperation(working, op, createWorldIndexes(working)); const scope = op.scope;
		if (op.kind === "node.delete") output[scope].push({ op: "remove", path: escapedPointer(["value", ...pathFor(before[scope], op.nodeId)]) });
		else if (op.kind === "node.create") output[scope].push({ op: "add", path: escapedPointer(["value", ...pathFor(working[scope], op.node.id)]), value: clone(op.node) });
		else { const nodeId = op.kind === "node.copy" ? op.idMap[op.source.id]! : op.nodeId; const node = createWorldNodeIndex(working[scope]).get(nodeId)?.node; if (node) output[scope].push({ op: "replace", path: escapedPointer(["value", ...pathFor(working[scope], nodeId)]), value: clone(node) }); }
	}
	return output;
}
