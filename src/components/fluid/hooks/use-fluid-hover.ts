import {
  ref,
  shallowRef,
  watch,
  onUnmounted,
  toValue,
  type MaybeRefOrGetter,
  type Ref,
} from "vue";

export interface ItemRect {
  top: number;
  height: number;
  left: number;
  width: number;
}

export interface UseFluidHoverOptions {
  /**
   * 沿哪个方向解析最近的项。
   *   "y"  — 垂直列表（默认）：按 top/height 取最近
   *   "x"  — 水平条：按 left/width 取最近
   *   "xy" — 二维网格：按到每个项中心的欧氏距离跨行跨列取最近卡片
   */
  axis?: MaybeRefOrGetter<"x" | "y" | "xy">;
  /**
   * 让某个项在命中测试中不可见但不注销——用于保持挂载却被裁剪的行
   * （折叠的子树）。注销会使所有测量失效；跳过则保持集合稳定。
   * 每次鼠标移动都会调用，保持廉价。
   */
  isItemDisabled?: (element: HTMLElement) => boolean;
}

export interface FluidHoverHandlers {
  onMouseMove: (e: MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export interface UseFluidHoverReturn {
  activeIndex: Ref<number | null>;
  setActiveIndex: (index: number | null) => void;
  itemRects: Ref<ItemRect[]>;
  isMeasured: Ref<boolean>;
  session: Ref<number>;
  sessionRef: Ref<number>;
  handlers: FluidHoverHandlers;
  registerItem: (index: number, element: HTMLElement | null) => void;
  remeasure: () => void;
  measureItems: () => void;
}

const measurementAttempts = 3;

export function useFluidHover<T extends HTMLElement>(
  container: MaybeRefOrGetter<T | null | undefined>,
  options: UseFluidHoverOptions = {}
): UseFluidHoverReturn {
  const { isItemDisabled } = options;
  const items = new Map<number, HTMLElement>();
  const activeIndex = ref<number | null>(null);
  const itemRects = ref<ItemRect[]>([]);
  const isMeasured = ref(false);
  const itemRectsRef = shallowRef<ItemRect[]>([]);
  const session = ref(0);
  let rafId: number | null = null;
  let remeasureRafId: number | null = null;

  function getContainer(): T | null {
    return (toValue(container) as T | null | undefined) ?? null;
  }

  function runMeasurement(): boolean {
    const containerEl = getContainer();
    if (!containerEl) return false;
    const rects: ItemRect[] = [];
    let everyItemHasLayout = true;
    items.forEach((element, index) => {
      const hasLayoutBox =
        element.offsetParent !== null ||
        element.offsetWidth > 0 ||
        element.offsetHeight > 0;
      if (!hasLayoutBox) {
        everyItemHasLayout = false;
        return;
      }
      let top = element.offsetTop;
      let left = element.offsetLeft;
      let ancestor = element.offsetParent as HTMLElement | null;
      while (ancestor && ancestor !== containerEl && containerEl.contains(ancestor)) {
        top += ancestor.offsetTop + ancestor.clientTop;
        left += ancestor.offsetLeft + ancestor.clientLeft;
        ancestor = ancestor.offsetParent as HTMLElement | null;
      }
      rects[index] = {
        top,
        height: element.offsetHeight,
        left,
        width: element.offsetWidth,
      };
    });
    if (!everyItemHasLayout) return false;
    const prev = itemRectsRef.value;
    let changed = prev.length !== rects.length;
    for (let i = 0; !changed && i < rects.length; i++) {
      const p = prev[i];
      const r = rects[i];
      if (p === r) continue;
      changed =
        !p ||
        !r ||
        p.top !== r.top ||
        p.left !== r.left ||
        p.width !== r.width ||
        p.height !== r.height;
    }
    if (changed) {
      itemRectsRef.value = rects;
      itemRects.value = rects;
    }
    return true;
  }

  function measureItems() {
    if (runMeasurement()) {
      isMeasured.value = true;
    }
  }

  function scheduleMeasurement(attemptsLeft: number) {
    if (remeasureRafId !== null) {
      cancelAnimationFrame(remeasureRafId);
    }
    remeasureRafId = requestAnimationFrame(() => {
      remeasureRafId = null;
      if (runMeasurement()) {
        isMeasured.value = true;
      } else if (attemptsLeft > 1) {
        scheduleMeasurement(attemptsLeft - 1);
      }
    });
  }

  function remeasure() {
    isMeasured.value = false;
    scheduleMeasurement(measurementAttempts);
  }

  let itemResizeObserver: ResizeObserver | null = null;
  function getItemRo(): ResizeObserver | null {
    if (itemResizeObserver === null && typeof ResizeObserver !== "undefined") {
      itemResizeObserver = new ResizeObserver(() =>
        scheduleMeasurement(measurementAttempts)
      );
    }
    return itemResizeObserver;
  }

  function registerItem(index: number, element: HTMLElement | null) {
    if (element) {
      items.set(index, element);
      getItemRo()?.observe(element);
    } else {
      const previous = items.get(index);
      if (previous) itemResizeObserver?.unobserve(previous);
      items.delete(index);
    }
    remeasure();
  }

  function handleMouseMove(e: MouseEvent) {
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }

    rafId = requestAnimationFrame(() => {
      rafId = null;
      const containerEl = getContainer();
      if (!containerEl) return;

      const axis = toValue(options.axis) ?? "y";
      const containerRect = containerEl.getBoundingClientRect();

      if (axis === "xy") {
        let closestIndex: number | null = null;
        let closestDistance = Infinity;
        let containingIndex: number | null = null;

        const rects = itemRectsRef.value;
        const scrollX = containerEl.scrollLeft;
        const scrollY = containerEl.scrollTop;
        const borderX = containerEl.clientLeft;
        const borderY = containerEl.clientTop;

        const scaleX =
          containerEl.offsetWidth > 0
            ? containerRect.width / containerEl.offsetWidth
            : 1;
        const scaleY =
          containerEl.offsetHeight > 0
            ? containerRect.height / containerEl.offsetHeight
            : 1;

        for (let index = 0; index < rects.length; index++) {
          const r = rects[index];
          if (!r) continue;
          const el = items.get(index);
          if (el && isItemDisabled?.(el)) continue;

          const left = containerRect.left + (borderX + r.left - scrollX) * scaleX;
          const top = containerRect.top + (borderY + r.top - scrollY) * scaleY;
          const width = r.width * scaleX;
          const height = r.height * scaleY;

          if (
            mouseX >= left &&
            mouseX <= left + width &&
            mouseY >= top &&
            mouseY <= top + height
          ) {
            containingIndex = index;
          }

          const dx = mouseX - (left + width / 2);
          const dy = mouseY - (top + height / 2);
          const distance = Math.hypot(dx, dy);

          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
          }
        }

        activeIndex.value = containingIndex ?? closestIndex;
        return;
      }

      const mousePos = axis === "x" ? mouseX : mouseY;

      let closestIndex: number | null = null;
      let closestDistance = Infinity;
      let containingIndex: number | null = null;

      const rects = itemRectsRef.value;
      const scrollOffset = axis === "x" ? containerEl.scrollLeft : containerEl.scrollTop;
      const borderOffset = axis === "x" ? containerEl.clientLeft : containerEl.clientTop;
      const containerEdge = axis === "x" ? containerRect.left : containerRect.top;

      const layoutSize = axis === "x" ? containerEl.offsetWidth : containerEl.offsetHeight;
      const visualSize = axis === "x" ? containerRect.width : containerRect.height;
      const scale = layoutSize > 0 ? visualSize / layoutSize : 1;

      for (let index = 0; index < rects.length; index++) {
        const r = rects[index];
        if (!r) continue;
        const el = items.get(index);
        if (el && isItemDisabled?.(el)) continue;

        const contentPos = axis === "x" ? r.left : r.top;
        const itemStart = containerEdge + (borderOffset + contentPos - scrollOffset) * scale;
        const itemSize = (axis === "x" ? r.width : r.height) * scale;
        const itemEnd = itemStart + itemSize;

        if (mousePos >= itemStart && mousePos <= itemEnd) {
          containingIndex = index;
        }

        const itemCenter = itemStart + itemSize / 2;
        const distance = Math.abs(mousePos - itemCenter);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      }

      activeIndex.value = containingIndex ?? closestIndex;
    });
  }

  function handleMouseEnter() {
    session.value += 1;
  }

  function handleMouseLeave() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    activeIndex.value = null;
  }

  let containerRo: ResizeObserver | null = null;
  watch(
    () => getContainer(),
		(el, _prevEl, onCleanup) => {
      if (!el || typeof ResizeObserver === "undefined") return;
      containerRo?.disconnect();
      containerRo = new ResizeObserver(() => scheduleMeasurement(measurementAttempts));
      containerRo.observe(el);
      onCleanup(() => {
        containerRo?.disconnect();
        containerRo = null;
      });
    },
    { immediate: true }
  );

  onUnmounted(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (remeasureRafId !== null) cancelAnimationFrame(remeasureRafId);
    itemResizeObserver?.disconnect();
    itemResizeObserver = null;
    containerRo?.disconnect();
    containerRo = null;
  });

  return {
    activeIndex,
    setActiveIndex: (val) => (activeIndex.value = val),
    itemRects,
    isMeasured,
    session,
    sessionRef: session,
    handlers: {
      onMouseMove: handleMouseMove,
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
    },
    registerItem,
    remeasure,
    measureItems,
  };
}

/**
 * 辅助组合式函数：子项向 fluid hover 注册自己。
 */
export function useRegisterFluidHoverItem(
  registerItem: (index: number, element: HTMLElement | null) => void,
  index: MaybeRefOrGetter<number>,
  element: MaybeRefOrGetter<HTMLElement | null | undefined>
) {
  watch(
    [() => toValue(index), () => toValue(element)] as const,
    ([idx, el], _prev, onCleanup) => {
      if (el && idx >= 0) {
        registerItem(idx, el);
        onCleanup(() => registerItem(idx, null));
      }
    },
    { immediate: true }
  );
}

export type UseProximityHoverOptions = UseFluidHoverOptions;
export type ProximityHandlers = FluidHoverHandlers;
export type UseProximityHoverReturn = UseFluidHoverReturn;
export const useProximityHover = useFluidHover;
export const useRegisterProximityItem = useRegisterFluidHoverItem;
