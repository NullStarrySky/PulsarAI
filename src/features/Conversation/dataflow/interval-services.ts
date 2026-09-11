import type { ChatMessage, ChatContainer } from "./types";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface IntervalDefinition { id: string; type: string; name?: string; content?: JsonValue; autoEndAfter?: number }
export type IntervalOperation = { kind: "interval.open"; interval: IntervalDefinition } | { kind: "interval.close"; intervalId: string };
export interface IntervalPosition { containerId: string; messageId: string }
export interface OpenInterval { interval: IntervalDefinition; openedAt: IntervalPosition; visibleContainersAfterOpen: number }
export interface IntervalSpan extends OpenInterval { closedAt: IntervalPosition; closeKind: "explicit" | "auto" }
export interface IntervalDiagnostic { code: "interval.duplicate-open" | "interval.close-missing" | "interval.invalid-auto-end" | "interval.unclosed"; messageId: string; containerId: string; intervalId: string }
export interface IntervalProjection { openIntervals: OpenInterval[]; spans: IntervalSpan[]; diagnostics: IntervalDiagnostic[] }

function activeMessage(container: ChatContainer): ChatMessage | null {
	return container.content[container.activeMessage ?? 0] ?? container.content[0] ?? null;
}

/** Reduces the selected versions along one active conversation path. */
export function evaluateIntervals(activePath: ChatContainer[]): IntervalProjection {
	const open = new Map<string, OpenInterval>();
	const spans: IntervalSpan[] = [];
	const diagnostics: IntervalDiagnostic[] = [];
	for (const container of activePath) {
		const message = activeMessage(container);
		if (!message) continue;
		const position = { containerId: container.id, messageId: message.id };
		const visible = container.role !== "system";
		if (visible) for (const value of open.values()) value.visibleContainersAfterOpen++;
		for (const operation of message.meta.intervalOperations ?? []) {
			if (operation.kind === "interval.open") {
				if (open.has(operation.interval.id)) { diagnostics.push({ code: "interval.duplicate-open", ...position, intervalId: operation.interval.id }); continue; }
				if (operation.interval.autoEndAfter !== undefined && (!Number.isInteger(operation.interval.autoEndAfter) || operation.interval.autoEndAfter < 1)) diagnostics.push({ code: "interval.invalid-auto-end", ...position, intervalId: operation.interval.id });
				open.set(operation.interval.id, { interval: operation.interval, openedAt: position, visibleContainersAfterOpen: 0 });
			} else {
				const opened = open.get(operation.intervalId);
				if (!opened) diagnostics.push({ code: "interval.close-missing", ...position, intervalId: operation.intervalId });
				else { spans.push({ ...opened, closedAt: position, closeKind: "explicit" }); open.delete(operation.intervalId); }
			}
		}
		if (visible) for (const [id, opened] of open) if (opened.interval.autoEndAfter && opened.visibleContainersAfterOpen >= opened.interval.autoEndAfter) { spans.push({ ...opened, closedAt: position, closeKind: "auto" }); open.delete(id); }
	}
	for (const opened of open.values()) diagnostics.push({ code: "interval.unclosed", ...opened.openedAt, intervalId: opened.interval.id });
	return { openIntervals: [...open.values()], spans, diagnostics };
}
