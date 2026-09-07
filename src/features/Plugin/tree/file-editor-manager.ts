import { ref } from "vue";
import type { WorldFileNode } from "./world-types";

export interface OpenFileItem {
	id: string;
	file: WorldFileNode;
	path: string;
	localPluginId: string;
	conversationId?: string;
	zIndex: number;
	bounceKey: number;
	initialOffset: { x: number; y: number };
}

let zIndexCounter = 100;
let cascadeCounter = 0;

export const openFiles = ref<OpenFileItem[]>([]);

export const locateRequest = ref<{
	path: string;
	file: WorldFileNode;
	timestamp: number;
} | null>(null);

export function openFile(
	file: WorldFileNode,
	path: string,
	localPluginId: string,
	conversationId?: string,
) {
	const existing = openFiles.value.find((item) => item.path === path);
	if (existing) {
		zIndexCounter += 1;
		existing.zIndex = zIndexCounter;
		existing.bounceKey += 1;
		return;
	}
	zIndexCounter += 1;
	const offsetIndex = cascadeCounter % 8;
	cascadeCounter += 1;
	const offsetX = offsetIndex * 28;
	const offsetY = offsetIndex * 28;

	openFiles.value.push({
		id: path,
		file,
		path,
		localPluginId,
		conversationId,
		zIndex: zIndexCounter,
		bounceKey: 0,
		initialOffset: { x: offsetX, y: offsetY },
	});
}

export function closeFile(path: string) {
	openFiles.value = openFiles.value.filter((item) => item.path !== path);
}

export function bringToFront(path: string) {
	const target = openFiles.value.find((item) => item.path === path);
	if (target) {
		zIndexCounter += 1;
		target.zIndex = zIndexCounter;
	}
}

export function requestLocate(path: string, file: WorldFileNode) {
	locateRequest.value = { path, file, timestamp: Date.now() };
}
