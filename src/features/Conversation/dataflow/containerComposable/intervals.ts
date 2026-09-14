import { computed, type MaybeRef, unref } from "vue";
import { markContainerDirty } from "../containers";
import type {
	IntervalDefinition,
	IntervalOperation,
} from "../activePathComposable/interval-services";
import { currentMessage } from "../activePathComposable/message-service";
import type { ChatContainer } from "../types";

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean" ||
		(typeof value === "number" && Number.isFinite(value))
	)
		return true;
	if (Array.isArray(value)) {
		if (seen.has(value)) return false;
		seen.add(value);
		return value.every((item) => isJsonValue(item, seen));
	}
	if (typeof value !== "object" || seen.has(value)) return false;
	seen.add(value);
	return Object.values(value).every((item) => isJsonValue(item, seen));
}

/** Interval operations belong to the active version of one message container. */
export function useContainerIntervals(
	source: MaybeRef<ChatContainer | null | undefined>,
) {
	const container = computed(() => unref(source));
	const message = computed(() => currentMessage(container.value));
	const operations = computed(
		() => message.value?.meta.intervalOperations ?? [],
	);
	function append(operation: IntervalOperation) {
		const target = message.value;
		const owner = container.value;
		if (!target || !owner) return;
		target.meta.intervalOperations ??= [];
		target.meta.intervalOperations.push(operation);
		markContainerDirty(owner.conversationid, owner.id);
		return operation;
	}
	function open(interval: IntervalDefinition) {
		if (!interval.id.trim() || !interval.type.trim())
			throw new Error("Interval 必须包含非空 id 和 type。");
		if (
			interval.autoEndAfter !== undefined &&
			(!Number.isInteger(interval.autoEndAfter) || interval.autoEndAfter < 1)
		)
			throw new Error("Interval autoEndAfter 必须是正整数。");
		if (interval.content !== undefined && !isJsonValue(interval.content))
			throw new Error("Interval content 必须是 JsonValue。");
		return append({
			kind: "interval.open",
			interval: structuredClone(interval),
		});
	}
	function close(intervalId: string) {
		if (!intervalId.trim()) throw new Error("Interval ID 不能为空。");
		return append({ kind: "interval.close", intervalId });
	}
	return { operations, open, close };
}
