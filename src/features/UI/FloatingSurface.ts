import interact from "interactjs";
import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";
import { useResponsiveStore } from "@/features/Misc/responsive-store";

export type FloatingFrame = { x: number; y: number; width: number; height: number };
const memory = new Map<string, FloatingFrame>();

/** Shared drag/resize controller for bounded desktop floating surfaces. */
export function useFloatingSurface(options: {
	surfaceId: string;
	open: Ref<boolean>;
	element: Ref<HTMLElement | { $el?: unknown } | null>;
	initialSize: { width: number; height: number };
	minSize: { width: number; height: number };
	zIndex?: number;
	persistGeometry?: boolean;
	dragHandleId?: string;
	initialPosition?: { x: number; y: number };
}) {
	const responsive = useResponsiveStore();
	const saved = (() => { try { return options.persistGeometry ? JSON.parse(localStorage.getItem(`pulsarai:surface:${options.surfaceId}`) ?? "null") as FloatingFrame | null : null; } catch { return null; } })();
	const frame = ref<FloatingFrame>(memory.get(options.surfaceId) ?? saved ?? { x: 0, y: 0, ...options.initialSize });
	let instance: ReturnType<typeof interact> | null = null;
	const style = computed(() => responsive.isMobileLayout
		? { inset: "0", width: "100vw", height: "100dvh", left: "0", top: "0", zIndex: options.zIndex ?? 50 }
		: { width: `${frame.value.width}px`, height: `${frame.value.height}px`, left: `${frame.value.x}px`, top: `${frame.value.y}px`, zIndex: options.zIndex ?? 50 });
	function center() {
		const width = Math.min(options.initialSize.width, Math.max(options.minSize.width, window.innerWidth - 32));
		const height = Math.min(options.initialSize.height, Math.max(options.minSize.height, window.innerHeight - 32));
		frame.value = memory.get(options.surfaceId) ?? saved ?? { x: options.initialPosition?.x ?? Math.max(8, Math.round((window.innerWidth - width) / 2)), y: options.initialPosition?.y ?? Math.max(8, Math.round((window.innerHeight - height) / 2)), width, height };
	}
	function stop() { instance?.unset(); instance = null; }
	function start() {
		stop();
		const candidate = options.element.value;
		const element = candidate instanceof HTMLElement ? candidate : candidate?.$el instanceof HTMLElement ? candidate.$el : null;
		if (!element || responsive.isMobileLayout) return;
		const allowFrom = options.dragHandleId
			? `#${CSS.escape(options.dragHandleId)}`
			: "[data-floating-drag-handle]";
		instance = interact(element)
			.draggable({
				allowFrom,
				ignoreFrom: "button, input, textarea, select, [role='button'], [role='tab'], [role='combobox']",
				modifiers: [interact.modifiers.restrictRect({ restriction: "parent", elementRect: { left: 0, right: 1, top: 0, bottom: 1 } })],
				listeners: { move(event) { frame.value = { ...frame.value, x: Math.max(0, frame.value.x + event.dx), y: Math.max(0, frame.value.y + event.dy) }; save(); } },
			})
			.resizable({
				edges: { left: true, right: true, top: true, bottom: true }, margin: 8,
				modifiers: [interact.modifiers.restrictEdges({ outer: "parent" }), interact.modifiers.restrictSize({ min: options.minSize })],
				listeners: { move(event) { const delta = event.deltaRect ?? { left: 0, top: 0 }; frame.value = { x: Math.max(0, frame.value.x + delta.left), y: Math.max(0, frame.value.y + delta.top), width: event.rect.width, height: event.rect.height }; save(); } },
			});
	}
	function save() {
		memory.set(options.surfaceId, { ...frame.value });
		if (options.persistGeometry) localStorage.setItem(`pulsarai:surface:${options.surfaceId}`, JSON.stringify(frame.value));
	}
	watch([options.open, () => responsive.isMobileLayout], async ([open]) => { stop(); if (!open) return; center(); await Promise.resolve(); start(); }, { immediate: true });
	onBeforeUnmount(stop);
	return { frame, style, start, stop, center };
}
