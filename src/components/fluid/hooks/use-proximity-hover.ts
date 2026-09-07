import { ref, shallowRef, watch, onUnmounted, toValue, type MaybeRefOrGetter, type Ref } from "vue";

export interface ItemRect {
  top: number;
  height: number;
  left: number;
  width: number;
}

export interface UseProximityHoverOptions {
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

export interface ProximityHandlers {
  onMouseMove: (e: MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export interface UseProximityHoverReturn {
  activeIndex: Ref<number | null>;
  setActiveIndex: (index: number | null) => void;
  itemRects: Ref<ItemRect[]>;
  /**
   * 每个已注册的项都被测量完成、且没有排队中的重测时为 true，
   * 即 `itemRects` 描述的是当前的项集合。绝对定位的 overlay 要以它作门控：
   * 一个基于稍后仍会被修正的 rect 挂载的 overlay，会从错误位置动画到
   * 正确位置，读起来像高亮从另一行滑过来。
   */
  isMeasured: Ref<boolean>;
  session: Ref<number>;
  handlers: ProximityHandlers;
  registerItem: (index: number, element: HTMLElement | null) => void;
  /**
   * 使已发布的 rect 失效，并重新执行 hook 的合并测量，直到稳定前
   * `isMeasured` 保持 false。当注册之外的事情使布局失效时使用它——
   * 一个在两次打开之间保持挂载的 popup 会一直持有已注册的项，
   * 否则没人会注意到它的 rect 是在隐藏时测的。
   */
  remeasure: () => void;
  measureItems: () => void;
}

/**
 * 已注册的项仍然没有布局盒子时，合并重测重试的帧数。popup 可能在
 * DOM 里先于布局出现一帧；重试胜过发布全零的 rect，而上限保证一个
 * 永久隐藏的列表不会永远空转。
 */
const measurementAttempts = 3;

export function useProximityHover<T extends HTMLElement>(
  container: MaybeRefOrGetter<T | null | undefined>,
  options: UseProximityHoverOptions = {}
): UseProximityHoverReturn {
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

  /**
   * 为每个已注册的项发布 rect。测量无法完成时（无容器，或某项没有
   * 布局盒子）返回 false——此时什么都不发布，让上一次完整测量保留，
   * 而不是被全零覆盖。
   */
  function runMeasurement(): boolean {
    const containerEl = getContainer();
    if (!containerEl) return false;
    const rects: ItemRect[] = [];
    let everyItemHasLayout = true;
    items.forEach((element, index) => {
      // 位于 display:none / 尚未布局的 popup 里的元素没有 offsetParent，
      // 所有 offset 都报 0。发布它会把 overlay 钉在列表顶部，
      // 所以把整轮视为不完整。没有盒子只有这一种情况：
      // position: fixed 的元素同样没有 offsetParent 但确实有尺寸。
      const hasLayoutBox =
        element.offsetParent !== null ||
        element.offsetWidth > 0 ||
        element.offsetHeight > 0;
      if (!hasLayoutBox) {
        everyItemHasLayout = false;
        return;
      }
      // 使用 offset* 而不是 getBoundingClientRect，让测量不受 CSS transform
      // 影响（例如父级 motion.div 的 scaleY 动画）。offsetTop/offsetLeft 是
      // 相对 offsetParent（滚动容器）的布局值，与 `position: absolute`
      // 子元素使用的坐标系一致。嵌套在容器定位后代里的项（侧边栏子菜单的
      // 行位于定位的行内）会累积这些祖先的偏移，因此每个 rect 都落在容器
      // 自己的坐标系里；对扁平列表，这个循环不会运行，正好就是
      // 纯 offsetTop/offsetLeft。
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
    // 没有移动时跳过状态更新（廉价的 top/left/width/height 比较），
    // 避免多余的重测搅动重渲染。
    const prev = itemRectsRef.value;
    let changed = prev.length !== rects.length;
    for (let i = 0; !changed && i < rects.length; i++) {
      const p = prev[i];
      const r = rects[i];
      if (p === r) continue; // 都是 undefined（稀疏槽位）
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

  /**
   * hook 的唯一测量通道：把每个触发源（项注册、容器 resize）合并到
   * 下一帧的一次重测里，并且是唯一上报就绪的地方，因此 `isMeasured`
   * 不可能在另一轮测量仍在排队时变回 true。
   */
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
    // 就绪先降级：直到下面这轮测量稳定前，已发布的 rect 可能与屏幕上
    // 的内容不符，基于它们定位的 overlay 会在挂载后被修正——表现为滑动。
    isMeasured.value = false;
    scheduleMeasurement(measurementAttempts);
  }

  // 观察已注册的项本身（不只是容器）：原地改变尺寸的行——例如选中背景
  // 还在时全站尺寸档位翻转——必须使已发布的 rect 失效，即使下面 effect
  // 捕获的容器已经被重挂载、ref 指向了与被观察元素不同的元素。
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
    // 把快速的注册/注销调用（例如列表行重挂载时）合并为下一帧的一次
    // 重测，这样消费方不必在容器子元素替换后手动调用 measureItems。
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

      // ── 2-D 网格路径 ──────────────────────────────────────────
      // 当项换行成行与列，单轴最近项无法判断光标离哪张卡最近。
      // 按到每个项中心的欧氏距离解析，并优先选择光标实际所在的项
      //（点在矩形内）。
      if (axis === "xy") {
        let closestIndex: number | null = null;
        let closestDistance = Infinity;
        let containingIndex: number | null = null;

        const rects = itemRectsRef.value;
        const scrollX = containerEl.scrollLeft;
        const scrollY = containerEl.scrollTop;
        const borderX = containerEl.clientLeft;
        const borderY = containerEl.clientTop;
        // 把布局坐标映射进视觉/视口空间，计入任何累积的祖先变换：
        // 缩放（见单轴路径的说明）。X 与 Y 独立缩放。
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
      // 使用实时滚动位置把内容坐标转换成视口坐标
      const scrollOffset = axis === "x" ? containerEl.scrollLeft : containerEl.scrollTop;
      const borderOffset = axis === "x" ? containerEl.clientLeft : containerEl.clientTop;
      const containerEdge = axis === "x" ? containerRect.left : containerRect.top;
      // 项 rect 是布局值（offset*）；容器的 bounding rect 反映任何累积的
      // 祖先变换：缩放。计算缩放系数，把布局坐标映射进光标所在的
      // 视觉视口空间。
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

  // 容器 resize 时重测——回流会移动项，即使注册集合没变，否则 itemRects
  // 会过期。与注册/注销共用同一个 rAF 合并。就绪状态刻意不降级：
  // 项集合没变，已发布的 rect 仍然可用，每次回流都隐藏 overlay 会让它们闪烁。
  watch(
    () => getContainer(),
    (containerEl, _prev, onCleanup) => {
      if (!containerEl || typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(() => scheduleMeasurement(measurementAttempts));
      ro.observe(containerEl);
      onCleanup(() => ro.disconnect());
    },
    { immediate: true }
  );

  // 卸载时清理 rAF 与项观察器
  onUnmounted(() => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    if (remeasureRafId !== null) {
      cancelAnimationFrame(remeasureRafId);
    }
    itemResizeObserver?.disconnect();
    itemResizeObserver = null;
  });

  return {
    activeIndex,
    setActiveIndex: (index: number | null) => {
      activeIndex.value = index;
    },
    itemRects,
    isMeasured,
    session,
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
 * 子项用它向邻近悬停系统注册自己。
 * 组件里传模板 ref 与 index；挂载/卸载时自动注册/注销。
 */
export function useRegisterProximityItem(
  registerItem: (index: number, element: HTMLElement | null) => void,
  index: () => number,
  element: MaybeRefOrGetter<HTMLElement | null>
) {
  watch(
    () => [index(), toValue(element)] as const,
    ([idx, el], _prev, onCleanup) => {
      registerItem(idx, el);
      onCleanup(() => registerItem(idx, null));
    },
    { immediate: true }
  );
}
