import { loadChat } from "../chats/chat-service";
import {
	loadContainersForChat,
	persistContainer,
	pathForTail,
} from "./message-service";
import type { ChatMessage, ChatMessageContainer } from "./message-types";

export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export interface IntervalDefinition {
	id: string;
	type: string;
	name?: string;
	content?: JsonValue;
	/** Visible containers after the open container. Must be a positive integer. */
	autoEndAfter?: number;
}

export type IntervalOperation =
	| { kind: "interval.open"; interval: IntervalDefinition }
	| { kind: "interval.close"; intervalId: string };

export interface IntervalPosition {
	containerId: string;
	messageId: string;
}

export interface OpenInterval {
	interval: IntervalDefinition;
	openedAt: IntervalPosition;
	visibleContainersAfterOpen: number;
}

export interface IntervalSpan {
	interval: IntervalDefinition;
	openedAt: IntervalPosition;
	closedAt: IntervalPosition;
	closeKind: "explicit" | "auto";
	visibleContainersAfterOpen: number;
}

export interface IntervalDiagnostic {
	code:
		| "interval.duplicate-open"
		| "interval.close-missing"
		| "interval.invalid-auto-end"
		| "interval.unclosed";
	messageId: string;
	containerId: string;
	intervalId: string;
}

export interface IntervalProjection {
	openIntervals: OpenInterval[];
	spans: IntervalSpan[];
	diagnostics: IntervalDiagnostic[];
}

export type OpenIntervalInput = IntervalDefinition;

function activeMessage(container: ChatMessageContainer): ChatMessage | null {
	const index = container.activeMessage ?? 0;
	return container.content[index] ?? container.content[0] ?? null;
}

function position(container: ChatMessageContainer, message: ChatMessage): IntervalPosition {
	return { containerId: container.id, messageId: message.id };
}

function isJsonValue(value: unknown, seen = new Set<object>()): value is JsonValue {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean" ||
		(typeof value === "number" && Number.isFinite(value))
	) {
		return true;
	}
	if (Array.isArray(value)) {
		if (seen.has(value)) return false;
		seen.add(value);
		return value.every((item) => isJsonValue(item, seen));
	}
	if (typeof value !== "object" || seen.has(value)) return false;
	seen.add(value);
	return Object.values(value).every((item) => isJsonValue(item, seen));
}

function assertOpenInput(input: OpenIntervalInput): void {
	if (!input.id.trim() || !input.type.trim()) {
		throw new Error("Interval 必须包含非空 id 和 type。");
	}
	if (
		input.autoEndAfter !== undefined &&
		(!Number.isInteger(input.autoEndAfter) || input.autoEndAfter < 1)
	) {
		throw new Error("Interval autoEndAfter 必须是正整数。");
	}
	if (input.content !== undefined && !isJsonValue(input.content)) {
		throw new Error("Interval content 必须是 JsonValue。");
	}
}

/**
 * Reduces selected message versions along one active path. An automatic close
 * happens after the Nth later visible (non-system) container has been reduced.
 */
export function evaluateIntervals(
	activePath: ChatMessageContainer[],
): IntervalProjection {
	const open = new Map<string, OpenInterval>();
	const spans: IntervalSpan[] = [];
	const diagnostics: IntervalDiagnostic[] = [];

	for (const container of activePath) {
		const message = activeMessage(container);
		if (!message) continue;
		const currentPosition = position(container, message);
		const visible = container.role !== "system";

		if (visible) {
			for (const interval of open.values()) {
				interval.visibleContainersAfterOpen += 1;
			}
		}

		for (const operation of message.meta.intervalOperations ?? []) {
			if (operation.kind === "interval.open") {
				const { interval } = operation;
				if (open.has(interval.id)) {
					diagnostics.push({
						code: "interval.duplicate-open",
						...currentPosition,
						intervalId: interval.id,
					});
					continue;
				}
				if (
					interval.autoEndAfter !== undefined &&
					(!Number.isInteger(interval.autoEndAfter) || interval.autoEndAfter < 1)
				) {
					diagnostics.push({
						code: "interval.invalid-auto-end",
						...currentPosition,
						intervalId: interval.id,
					});
				}
				open.set(interval.id, {
					interval,
					openedAt: currentPosition,
					visibleContainersAfterOpen: 0,
				});
				continue;
			}

			const opened = open.get(operation.intervalId);
			if (!opened) {
				diagnostics.push({
					code: "interval.close-missing",
					...currentPosition,
					intervalId: operation.intervalId,
				});
				continue;
			}
			spans.push({
				...opened,
				closedAt: currentPosition,
				closeKind: "explicit",
			});
			open.delete(operation.intervalId);
		}

		if (visible) {
			for (const [id, opened] of open) {
				if (
					opened.interval.autoEndAfter !== undefined &&
					opened.interval.autoEndAfter > 0 &&
					opened.visibleContainersAfterOpen >= opened.interval.autoEndAfter
				) {
					spans.push({
						...opened,
						closedAt: currentPosition,
						closeKind: "auto",
					});
					open.delete(id);
				}
			}
		}
	}

	for (const opened of open.values()) {
		diagnostics.push({
			code: "interval.unclosed",
			...opened.openedAt,
			intervalId: opened.interval.id,
		});
	}
	return { openIntervals: [...open.values()], spans, diagnostics };
}

function findMessageContainer(
	containers: ChatMessageContainer[],
	messageVersion: ChatMessage,
): ChatMessageContainer {
	const container = containers.find((item) =>
		item.content.some((message) => message.id === messageVersion.id),
	);
	if (!container) throw new Error("Interval 消息版本不属于当前会话。");
	return container;
}

export async function openInterval(
	containers: ChatMessageContainer[],
	messageVersion: ChatMessage,
	input: OpenIntervalInput,
): Promise<IntervalOperation> {
	assertOpenInput(input);
	const container = findMessageContainer(containers, messageVersion);
	const operation: IntervalOperation = {
		kind: "interval.open",
		interval: structuredClone(input),
	};
	messageVersion.meta.intervalOperations ??= [];
	messageVersion.meta.intervalOperations.push(operation);
	await persistContainer(container);
	return operation;
}

export async function closeInterval(
	containers: ChatMessageContainer[],
	messageVersion: ChatMessage,
	intervalId: string,
): Promise<IntervalOperation> {
	if (!intervalId.trim()) throw new Error("Interval ID 不能为空。");
	const container = findMessageContainer(containers, messageVersion);
	const operation: IntervalOperation = { kind: "interval.close", intervalId };
	messageVersion.meta.intervalOperations ??= [];
	messageVersion.meta.intervalOperations.push(operation);
	await persistContainer(container);
	return operation;
}

export async function getIntervalProjection(chatId: string): Promise<IntervalProjection> {
	const chat = await loadChat(chatId);
	if (!chat) return { openIntervals: [], spans: [], diagnostics: [] };
	const containers = await loadContainersForChat(chatId);
	return evaluateIntervals(pathForTail(containers, chat.lastContainerId));
}

export async function getOpenIntervals(chatId: string): Promise<OpenInterval[]> {
	return (await getIntervalProjection(chatId)).openIntervals;
}

export async function getIntervalSpans(chatId: string): Promise<IntervalSpan[]> {
	return (await getIntervalProjection(chatId)).spans;
}
